import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify, decodeJwt } from 'jose';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { Redis } from '@upstash/redis';

// Configuration schema
const ConfigSchema = z.object({
  identityOrder: z.array(z.enum(['jwt-sub', 'session-cookie', 'ip'])),
  jwtSecret: z.string().optional(),
  limits: z.object({
    global: z.object({
      minute: z.number(),
      hour: z.number(),
      day: z.number(),
      month: z.number(),
    }),
  }),
  routesInScope: z.array(z.string()),
  turnstileEnabled: z.boolean().optional(),
  rateLimitingEnabled: z.boolean().optional(),
});

type Config = z.infer<typeof ConfigSchema>;

let cachedConfig: Config | null = null;
let configLastModified = 0;
let cachedMergedConfig: Config | null = null;
let lastRedisLoadMs = 0;
const REDIS_REFRESH_THROTTLE_MS = 3000;

/**
 * Load and validate configuration from Redis (overrides) and config/rate-limits.json (defaults)
 */
function loadConfig(): Config {
  // 1) Load base config from file (with caching based on mtime)
  let fileConfig: Config | null = null;
  try {
    const configPath = path.join(process.cwd(), 'config', 'rate-limits.json');
    const stats = fs.statSync(configPath);
    if (!cachedConfig || stats.mtimeMs > configLastModified) {
      const configContent = fs.readFileSync(configPath, 'utf-8');
      const parsedConfig = JSON.parse(configContent);
      cachedConfig = ConfigSchema.parse(parsedConfig);
      configLastModified = stats.mtimeMs;
      console.log('[Identity] Base configuration (file) loaded');
    }
    fileConfig = cachedConfig!;
  } catch (error) {
    console.error('[Identity] Failed to load file config:', error);
    fileConfig = {
      identityOrder: ['jwt-sub', 'session-cookie', 'ip'],
      jwtSecret: undefined,
      limits: {
        global: {
          minute: 10,
          hour: 100,
          day: 1000,
          month: 30000,
        },
      },
      routesInScope: ['/api/proxy/projects', '/api/proxy/user'],
      turnstileEnabled: false,
      rateLimitingEnabled: false,
    };
  }

  // 2) Kick best-effort refresh of Redis overrides and return last known merged config
  maybeRefreshRedisOverrides(fileConfig);
  return cachedMergedConfig || fileConfig;
}

function isPlainObject(value: any) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function deepMerge<T>(target: T, source: any): T {
  if (!isPlainObject(source)) return target;
  const output: any = Array.isArray(target) ? [...(target as any)] : { ...(target as any) };
  for (const key of Object.keys(source)) {
    const srcVal = (source as any)[key];
    const tgtVal = (output as any)[key];
    if (isPlainObject(srcVal) && isPlainObject(tgtVal)) {
      (output as any)[key] = deepMerge(tgtVal, srcVal);
    } else {
      (output as any)[key] = srcVal;
    }
  }
  return output;
}

async function fetchRedisOverrides(): Promise<any | null> {
  try {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return null;
    const redis = new Redis({ url, token });
    const data = await redis.get('admin:rate-limit-config');
    return data || null;
  } catch (e) {
    console.warn('[Identity] Failed to fetch Redis overrides:', e);
    return null;
  }
}

function mapOverridesToConfig(baseConfig: Config, overrides: any): Config {
  if (!overrides || typeof overrides !== 'object') return baseConfig;
  const merged = deepMerge(baseConfig, {});
  
  // Limits
  if (overrides.limits && overrides.limits.global) {
    merged.limits.global.minute = overrides.limits.global.minute ?? merged.limits.global.minute;
    merged.limits.global.hour = overrides.limits.global.hour ?? merged.limits.global.hour;
    merged.limits.global.day = overrides.limits.global.day ?? merged.limits.global.day;
    merged.limits.global.month = overrides.limits.global.month ?? merged.limits.global.month;
  }
  
  // Routes overrides
  if (overrides.routes) {
    (merged as any).routes = overrides.routes;
  }
  
  // routesInScope overrides
  if (Array.isArray(overrides.routesInScope)) {
    merged.routesInScope = overrides.routesInScope;
  }
  
  // Turnstile flag (legacy support - Turnstile config is now env-only)
  if (typeof overrides.turnstileEnabled === 'boolean') {
    merged.turnstileEnabled = overrides.turnstileEnabled;
  }
  
  // Rate limiting enabled flag
  if (typeof overrides.rateLimitingEnabled === 'boolean') {
    merged.rateLimitingEnabled = overrides.rateLimitingEnabled;
  }
  
  // Optional jwtSecret override
  if (typeof overrides.jwtSecret === 'string' && overrides.jwtSecret.length > 0) {
    (merged as any).jwtSecret = overrides.jwtSecret;
  }
  
  return merged;
}

function maybeRefreshRedisOverrides(fileConfig: Config) {
  const now = Date.now();
  if (now - lastRedisLoadMs < REDIS_REFRESH_THROTTLE_MS) {
    // Return quickly; a recent refresh occurred
    return;
  }
  lastRedisLoadMs = now;
  // Fire and forget
  fetchRedisOverrides().then((overrides) => {
    try {
      const merged = mapOverridesToConfig(fileConfig, overrides);
      cachedMergedConfig = merged;
    } catch (e) {
      // Keep previous cache on error
    }
  }).catch(() => {});
}

/**
 * Extract JWT subject from Authorization header
 */
async function extractJwtSubject(request: NextRequest): Promise<string | null> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const config = loadConfig();
    
    if (config.jwtSecret) {
      // Verify JWT with secret
      try {
        const secret = new TextEncoder().encode(config.jwtSecret);
        const { payload } = await jwtVerify(token, secret);
        return payload.sub || null;
      } catch (verifyError) {
        console.warn('[Identity] JWT verification failed:', verifyError);
        // Fall through to unverified decode for development
      }
    }
    
    // For development: decode without verification
    const decoded = decodeJwt(token);
    return decoded.sub || null;
  } catch (error) {
    console.warn('[Identity] JWT extraction failed:', error);
    return null;
  }
}

/**
 * Extract session ID from cookie
 */
function extractSessionId(request: NextRequest): string | null {
  try {
    // Try to get from Next.js cookies() first (for server components)
    try {
      const cookieStore = cookies();
      const sessionCookie = cookieStore.get('sessionId');
      if (sessionCookie?.value) {
        return sessionCookie.value;
      }
    } catch {
      // cookies() might not be available in all contexts
    }

    // Fallback to request headers
    const cookieHeader = request.headers.get('Cookie');
    if (!cookieHeader) {
      return null;
    }

    const parsedCookies = cookieHeader.split(';').reduce((acc, cookie) => {
      const [name, value] = cookie.trim().split('=');
      if (name && value) {
        acc[name] = decodeURIComponent(value);
      }
      return acc;
    }, {} as Record<string, string>);

    return parsedCookies.sessionId || null;
  } catch (error) {
    console.warn('[Identity] Session extraction failed:', error);
    return null;
  }
}

/**
 * Extract and hash IP address for privacy
 */
async function extractHashedIp(request: NextRequest): Promise<string> {
  try {
    // Get IP from various headers (Vercel, Cloudflare, etc.)
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const cfConnectingIp = request.headers.get('cf-connecting-ip');
    
    let ip = forwardedFor?.split(',')[0]?.trim() || 
             realIp || 
             cfConnectingIp || 
             request.ip || 
             '127.0.0.1';

    // Normalize IP to avoid cache/identity mismatches between routes
    // - Map IPv6 loopback to IPv4
    // - Strip IPv6 mapped IPv4 prefix ::ffff:
    // - Lowercase for consistency
    if (ip === '::1') {
      ip = '127.0.0.1';
    }
    if (ip?.startsWith('::ffff:')) {
      ip = ip.substring('::ffff:'.length);
    }
    ip = (ip || '').toLowerCase();

    // Hash the IP for privacy
    const encoder = new TextEncoder();
    const data = encoder.encode(ip);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex.substring(0, 16); // Use first 16 chars for brevity
  } catch (error) {
    console.warn('[Identity] IP hashing failed:', error);
    return 'unknown';
  }
}

/**
 * Main identity extraction function following the configured waterfall
 */
export async function getIdentityKey(request: NextRequest): Promise<string> {
  const config = loadConfig();
  
  for (const method of config.identityOrder) {
    try {
      switch (method) {
        case 'jwt-sub': {
          const jwtSub = await extractJwtSubject(request);
          if (jwtSub) {
            return `jwt:${jwtSub}`;
          }
          break;
        }
        
        case 'session-cookie': {
          const sessionId = extractSessionId(request);
          if (sessionId) {
            return `session:${sessionId}`;
          }
          break;
        }
        
        case 'ip': {
          const hashedIp = await extractHashedIp(request);
          return `ip:${hashedIp}`;
        }
      }
    } catch (error) {
      console.warn(`[Identity] Method ${method} failed:`, error);
      continue;
    }
  }
  
  // Fallback to anonymous if all methods fail
  return 'anonymous';
}

/**
 * Get the current configuration (for admin/debugging)
 */
export function getIdentityConfig(): Config {
  return loadConfig();
}

/**
 * Force refresh Redis configuration (for admin panel)
 */
export async function refreshRedisConfig(): Promise<void> {
  const fileConfig = cachedConfig || {
    identityOrder: ['jwt-sub', 'session-cookie', 'ip'],
    jwtSecret: undefined,
    limits: {
      global: {
        minute: 10,
        hour: 100,
        day: 1000,
        month: 30000,
      },
    },
    routesInScope: ['/api/proxy/projects', '/api/proxy/user'],
    turnstileEnabled: false,
    rateLimitingEnabled: false,
  };
  
  try {
    const overrides = await fetchRedisOverrides();
    const merged = mapOverridesToConfig(fileConfig, overrides);
    cachedMergedConfig = merged;
    lastRedisLoadMs = Date.now();
    console.log('[Identity] Redis configuration refreshed');
  } catch (error) {
    console.error('[Identity] Failed to refresh Redis config:', error);
  }
}
