import { NextRequest } from 'next/server';
import { Redis } from '@upstash/redis';
import { getIdentityKey, getIdentityConfig } from './identity';
import { applyTurnstileVerification, type TurnstileVerificationResult } from './turnstile-verification';

// Rate limit result interface
export interface RateLimitResult {
  allowed: boolean;
  headers: Record<string, string>;
  remaining: number;
  resetTime: number;
  limit: number;
  window: string;
  turnstileVerification?: TurnstileVerificationResult;
}

// Rate limit error class
export class RateLimitError extends Error {
  constructor(
    message: string,
    public result: RateLimitResult
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

// Redis client singleton
let redisClient: Redis | null = null;

/**
 * Get or create Redis client singleton
 */
function getRedisClient(): Redis {
  if (!redisClient) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    
    if (!url || !token) {
      throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set in environment');
    }
    
    redisClient = new Redis({
      url,
      token,
      retry: {
        retries: 3,
        backoff: (retryIndex) => Math.min(100 * Math.pow(2, retryIndex), 1000)
      }
    });
    
    console.log('[RateLimit] Redis client initialized');
  }
  
  return redisClient;
}

/**
 * Get current timestamp in seconds
 */
function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Calculate window start time for a given window type
 */
function getWindowStart(windowType: string, timestamp: number): number {
  switch (windowType) {
    case 'minute':
      return timestamp - (timestamp % 60);
    case 'hour':
      return timestamp - (timestamp % 3600);
    case 'day':
      return timestamp - (timestamp % 86400);
    case 'month':
      // Start of current month
      const date = new Date(timestamp * 1000);
      return Math.floor(new Date(date.getFullYear(), date.getMonth(), 1).getTime() / 1000);
    default:
      return timestamp;
  }
}

/**
 * Calculate reset time for a window
 */
function getResetTime(windowType: string, windowStart: number): number {
  const ttlMap = {
    minute: 60,
    hour: 3600,
    day: 86400,
    month: 2592000
  };
  
  return windowStart + (ttlMap[windowType as keyof typeof ttlMap] || 60);
}

/**
 * Generate Redis key for rate limiting
 */
function generateRedisKey(identityKey: string, window: string, windowStart: number): string {
  return `rate:${window}:${windowStart}:${identityKey}`;
}

/**
 * Log rate limit event to console (JSON format for easy parsing)
 */
function logRateLimitEvent(event: {
  identityKey: string;
  window: string;
  limit: number;
  count: number;
  allowed: boolean;
  path: string;
  timestamp: number;
}) {
  const logEntry = {
    timestamp: new Date(event.timestamp * 1000).toISOString(),
    identity: event.identityKey,
    window: event.window,
    limit: event.limit,
    count: event.count,
    allowed: event.allowed,
    path: event.path,
    remaining: Math.max(0, event.limit - event.count)
  };
  
  console.log('[RateLimit]', JSON.stringify(logEntry));
}

/**
 * Check rate limit for a specific window
 */
async function checkWindowLimit(
  identityKey: string,
  window: string,
  limit: number,
  path: string
): Promise<RateLimitResult> {
  const redis = getRedisClient();
  const timestamp = getCurrentTimestamp();
  const windowStart = getWindowStart(window, timestamp);
  const resetTime = getResetTime(window, windowStart);
  const redisKey = generateRedisKey(identityKey, window, windowStart);
  
  try {
    // Use Redis pipeline for atomic operations
    const pipeline = redis.pipeline();
    pipeline.incr(redisKey);
    pipeline.expire(redisKey, resetTime - timestamp);
    
    const results = await pipeline.exec();
    const count = results[0] as number;
    
    console.log(`[RateLimit] Redis check for ${identityKey}:`, {
      window,
      redisKey,
      count,
      limit,
      timestamp,
      windowStart,
      resetTime
    });
    
    const allowed = count <= limit;
    const remaining = Math.max(0, limit - count);
    
    // Log the event
    logRateLimitEvent({
      identityKey,
      window,
      limit,
      count,
      allowed,
      path,
      timestamp
    });
    
    return {
      allowed,
      headers: {
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': resetTime.toString(),
        'X-RateLimit-Window': window,
        ...(allowed ? {} : {
          'Retry-After': (resetTime - timestamp).toString()
        })
      },
      remaining,
      resetTime,
      limit,
      window
    };
  } catch (error) {
    console.error('[RateLimit] Redis error for window', window, ':', error);
    
    // Graceful degradation - allow request but log error
    return {
      allowed: true,
      headers: {
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': limit.toString(),
        'X-RateLimit-Reset': (timestamp + 60).toString(),
        'X-RateLimit-Window': window,
        'X-RateLimit-Error': 'redis-unavailable'
      },
      remaining: limit,
      resetTime: timestamp + 60,
      limit,
      window
    };
  }
}

/**
 * Get route-specific limits for a given path
 */
function getRouteSpecificLimits(path: string, config: any): any | null {
  if (!(config as any).routes) return null;
  
  // Find matching route pattern
  for (const [pattern, limits] of Object.entries((config as any).routes)) {
    if (pathMatchesPattern(path, pattern)) {
      console.log('[RateLimit] Found route-specific limits:', { pattern, limits, path });
      return limits;
    }
  }
  
  return null;
}

/**
 * Get the matching route pattern for a path
 */
function getMatchingRoutePattern(path: string, config: any): string | null {
  if (!(config as any).routes) return null;
  
  for (const pattern of Object.keys((config as any).routes)) {
    if (pathMatchesPattern(path, pattern)) {
      return pattern;
    }
  }
  
  return null;
}

/**
 * Check if a path matches a route pattern
 */
function pathMatchesPattern(path: string, pattern: string): boolean {
  // Handle wildcard patterns like "/api/users/*"
  if (pattern.endsWith('*')) {
    const basePattern = pattern.slice(0, -1);
    return path.startsWith(basePattern);
  }
  
  // Handle exact matches
  if (pattern.endsWith('/')) {
    return path === pattern || path.startsWith(pattern);
  }
  
  // Handle partial matches
  return path.startsWith(pattern);
}

/**
 * Check if a route is in scope for rate limiting
 */
function isRouteInScope(path: string): boolean {
  const config = getIdentityConfig();
  const routesInScope = config.routesInScope || [];
  
  return routesInScope.some(route => path.startsWith(route));
}

/**
 * Main rate limiting function
 */
export async function applyRateLimit(request: NextRequest): Promise<RateLimitResult> {
  try {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Check if rate limiting is enabled
    const identityConfig = getIdentityConfig();
    if (!identityConfig.rateLimitingEnabled) {
      return {
        allowed: true,
        headers: {
          'X-RateLimit-Enabled': 'false'
        },
        remaining: 999999,
        resetTime: getCurrentTimestamp() + 3600,
        limit: 999999,
        window: 'disabled'
      };
    }
    
    // Check if route is in scope
    if (!isRouteInScope(path)) {
      return {
        allowed: true,
        headers: {
          'X-RateLimit-Scope': 'excluded'
        },
        remaining: 999999,
        resetTime: getCurrentTimestamp() + 3600,
        limit: 999999,
        window: 'none'
      };
    }
    
    // Get user identity
    const identityKey = await getIdentityKey(request);
    
    // Apply Turnstile verification check
    const turnstileResult = await applyTurnstileVerification(request, identityKey);
    
    // If Turnstile verification is required but not passed, block the request
    if (turnstileResult.required && !turnstileResult.verified) {
      console.log('[RateLimit] Blocked request due to failed Turnstile verification:', {
        identity: identityKey.split(':')[0],
        path,
        error: turnstileResult.error
      });
      
      return {
        allowed: false,
        headers: {
          'X-RateLimit-Blocked': 'turnstile-required',
          'X-Turnstile-Required': 'true',
          'X-Turnstile-Error': turnstileResult.error || 'Verification required',
          'X-RateLimit-Identity': identityKey.split(':')[0],
        },
        remaining: 0,
        resetTime: getCurrentTimestamp() + 60,
        limit: 0,
        window: 'turnstile',
        turnstileVerification: turnstileResult
      };
    }
    const rateLimitConfig = getIdentityConfig();
    
    // Get route-specific limits or fall back to global limits
    const routeLimits = getRouteSpecificLimits(path, rateLimitConfig);
    const limits = routeLimits || rateLimitConfig.limits.global;
    
    console.log('[RateLimit] Using limits for path:', {
      path,
      limits,
      isRouteSpecific: !!routeLimits,
      routePattern: routeLimits ? getMatchingRoutePattern(path, rateLimitConfig) : 'global'
    });
    
    // Check all configured windows in order of restrictiveness
    const windows = ['minute', 'hour', 'day', 'month'] as const;
    
    for (const window of windows) {
      if (limits[window]) {
        const result = await checkWindowLimit(
          identityKey,
          window,
          limits[window],
          path
        );
        
        // If any window is exceeded, return immediately with 429
        if (!result.allowed) {
          return {
            ...result,
            headers: {
              ...result.headers,
              'X-RateLimit-Identity': identityKey.split(':')[0], // Don't expose full identity
            }
          };
        }
      }
    }
    
    // All windows passed - get the actual remaining count from minute window
    let actualRemaining = limits.minute || 999999;
    let actualResetTime = getCurrentTimestamp() + 60;
    
    // Get actual remaining from the minute window check
    if (limits.minute) {
      try {
        const redis = getRedisClient();
        const timestamp = getCurrentTimestamp();
        const windowStart = getWindowStart('minute', timestamp);
        const redisKey = generateRedisKey(identityKey, 'minute', windowStart);
        const currentCount = await redis.get(redisKey) || 0;
        
        actualRemaining = Math.max(0, limits.minute - Number(currentCount));
        actualResetTime = getResetTime('minute', windowStart);
      } catch (error) {
        console.warn('[RateLimit] Failed to get actual remaining:', error);
      }
    }
    
    return {
      allowed: true,
      headers: {
        'X-RateLimit-Limit': (limits.minute || 999999).toString(),
        'X-RateLimit-Remaining': actualRemaining.toString(),
        'X-RateLimit-Reset': actualResetTime.toString(),
        'X-RateLimit-Window': 'minute',
        'X-RateLimit-Identity': identityKey.split(':')[0],
        'X-Turnstile-Status': turnstileResult.verified ? 'verified' : 'not-required',
        'X-Turnstile-Bypass': turnstileResult.bypassReason || 'none',
      },
      remaining: actualRemaining,
      resetTime: actualResetTime,
      limit: limits.minute || 999999,
      window: 'minute',
      turnstileVerification: turnstileResult
    };
    
  } catch (error) {
    console.error('[RateLimit] Error applying rate limit:', error);
    
    // Graceful degradation - allow request
    return {
      allowed: true,
      headers: {
        'X-RateLimit-Error': 'system-error'
      },
      remaining: 999999,
      resetTime: getCurrentTimestamp() + 3600,
      limit: 999999,
      window: 'error'
    };
  }
}

/**
 * Get route protection status for admin panel
 */
export function getRouteProtectionStatus(path: string): {
  isProtected: boolean;
  isInScope: boolean;
  routePattern: string | null;
  limits: any | null;
  scope: string[];
} {
  const config = getIdentityConfig();
  const isInScope = isRouteInScope(path);
  const routePattern = getMatchingRoutePattern(path, config);
  const limits = getRouteSpecificLimits(path, config);
  
  return {
    isProtected: isInScope,
    isInScope,
    routePattern,
    limits: limits || config.limits.global,
    scope: config.routesInScope || []
  };
}

/**
 * Get all route patterns and their protection status
 */
export function getAllRouteStatus(): Array<{
  pattern: string;
  isProtected: boolean;
  limits: any | null;
  type: 'scope' | 'route-specific' | 'global';
}> {
  const config = getIdentityConfig();
  const results: Array<{
    pattern: string;
    isProtected: boolean;
    limits: any | null;
    type: 'scope' | 'route-specific' | 'global';
  }> = [];
  
  // Add routes in scope
  const scopeRoutes = config.routesInScope || [];
  scopeRoutes.forEach(route => {
    const routeLimits = getRouteSpecificLimits(route, config);
    results.push({
      pattern: route,
      isProtected: true,
      limits: routeLimits || config.limits.global,
      type: routeLimits ? 'route-specific' : 'scope'
    });
  });
  
  // Add route-specific patterns
  if ((config as any).routes) {
    Object.keys((config as any).routes).forEach(pattern => {
      if (!scopeRoutes.includes(pattern)) {
        results.push({
          pattern,
          isProtected: false,
          limits: (config as any).routes[pattern],
          type: 'route-specific'
        });
      }
    });
  }
  
  return results;
}

/**
 * Middleware-friendly rate limit check that throws on limit exceeded
 */
export async function enforceRateLimit(request: NextRequest): Promise<Record<string, string>> {
  const result = await applyRateLimit(request);
  
  if (!result.allowed) {
    throw new RateLimitError('Rate limit exceeded', result);
  }
  
  return result.headers;
}
