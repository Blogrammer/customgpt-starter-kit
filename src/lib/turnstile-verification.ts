/**
 * Turnstile Verification Integration
 * 
 * Middleware integration for Cloudflare Turnstile human verification.
 * Works with the rate limiting system to provide bot protection.
 * 
 * Features:
 * - Server-side token verification
 * - Integration with rate limiting middleware  
 * - Token caching to avoid repeated verification
 * - Configurable bypass for authenticated users
 * - Graceful degradation when service unavailable
 */

import { NextRequest } from 'next/server';
import { Redis } from '@upstash/redis';
import { getIdentityConfig } from '@/lib/identity';
import type { VerifySuccessResponse, VerifyErrorResponse } from '@/app/api/turnstile/verify/route';

// Verification cache interface
interface VerificationCache {
  token: string;
  verifiedAt: number;
  action?: string;
}

// In-memory cache for verified tokens (fast local fallback)
const verificationCache = new Map<string, VerificationCache>();

// Redis client singleton (shared verification cache across routes/instances)
let turnstileRedis: Redis | null = null;
function getTurnstileRedis(): Redis | null {
  try {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return null;
    if (!turnstileRedis) {
      turnstileRedis = new Redis({ url, token, retry: { retries: 3, backoff: (i) => Math.min(100 * 2 ** i, 1000) } });
      console.log('[Turnstile] Redis client initialized');
    }
    return turnstileRedis;
  } catch (e) {
    console.warn('[Turnstile] Failed to init Redis client:', e);
    return null;
  }
}

// Clean up expired cache entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;
  
  for (const [key, cache] of verificationCache.entries()) {
    if (now - cache.verifiedAt > fiveMinutes) {
      verificationCache.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Turnstile verification result
 */
export interface TurnstileVerificationResult {
  verified: boolean;
  required: boolean;
  error?: string;
  bypassReason?: 'authenticated' | 'disabled' | 'cached';
}

/**
 * Turnstile configuration
 */
export interface TurnstileConfig {
  enabled: boolean;
  bypassAuthenticated: boolean;
  requiredForIPUsers: boolean;
  cacheDuration: number; // in milliseconds
  siteKey?: string;
}

/**
 * Get Turnstile configuration from environment variables only
 */
export function getTurnstileConfig(): TurnstileConfig {
  const enabled = process.env.TURNSTILE_ENABLED === 'true';
  const cacheSeconds = parseInt(process.env.TURNSTILE_CACHE_DURATION || '300');
  const bypassAuthenticated = process.env.TURNSTILE_BYPASS_AUTHENTICATED !== 'false';
  const requiredForIPUsers = process.env.TURNSTILE_REQUIRED_FOR_IP_USERS !== 'false';
  
  return {
    enabled,
    bypassAuthenticated,
    requiredForIPUsers,
    cacheDuration: Math.max(1, cacheSeconds) * 1000,
    siteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  };
}

/**
 * Get client IP address from request
 */
function getClientIP(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP.trim();
  }

  const cfConnectingIP = request.headers.get('cf-connecting-ip');
  if (cfConnectingIP) {
    return cfConnectingIP.trim();
  }

  return request.ip || 'unknown';
}

/**
 * Check if user should be required to complete Turnstile challenge
 * 
 * @param identityKey - User identity from rate limiter
 * @param request - Next.js request object
 * @returns Whether Turnstile verification is required
 */
export function isTurnstileRequired(identityKey: string, request: NextRequest): boolean {
  const config = getTurnstileConfig();
  
  // If Turnstile is disabled, never require it
  if (!config.enabled) {
    return false;
  }

  // If user is authenticated (JWT) and bypass is enabled, skip Turnstile
  if (config.bypassAuthenticated && identityKey.startsWith('jwt:')) {
    return false;
  }

  // If user has a session and bypass is enabled, skip Turnstile
  if (config.bypassAuthenticated && identityKey.startsWith('session:')) {
    return false;
  }

  // For IP-based users, require Turnstile if configured
  if (identityKey.startsWith('ip:') && config.requiredForIPUsers) {
    return true;
  }

  // Default: don't require Turnstile
  return false;
}

/**
 * Verify Turnstile token by calling our internal API
 * 
 * @param token - Turnstile response token
 * @param action - Optional action identifier
 * @returns Verification result
 */
async function verifyTurnstileToken(
  token: string, 
  action?: string
): Promise<VerifySuccessResponse | VerifyErrorResponse> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/turnstile/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token, action }),
    });

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('[Turnstile] Verification API call failed:', error);
    return {
      success: false,
      errorCodes: ['network-error'],
      message: 'Failed to verify with Turnstile service',
    };
  }
}

/**
 * Get cache key for verification
 */
function getCacheKey(identityKey: string): string {
  return `turnstile:verified:${identityKey}`;
}

/**
 * Check if user has valid cached Turnstile verification
 * 
 * @param identityKey - User identity key
 * @param ip - Client IP address
 * @returns Whether user has valid cached verification
 */
async function hasValidCachedVerification(identityKey: string): Promise<boolean> {
  const config = getTurnstileConfig();
  const cacheKey = getCacheKey(identityKey);
  // 1) Check Redis (authoritative)
  try {
    const redis = getTurnstileRedis();
    if (redis) {
      const exists = await redis.exists(cacheKey);
      if (exists === 1) return true;
    }
  } catch (e) {
    console.warn('[Turnstile] Redis cache check failed:', e);
  }
  // 2) Fallback to in-memory
  const cached = verificationCache.get(cacheKey);
  if (!cached) return false;
  const now = Date.now();
  const isValid = now - cached.verifiedAt < config.cacheDuration;
  if (!isValid) {
    verificationCache.delete(cacheKey);
    return false;
  }
  return true;
}

/**
 * Public helper: check if identity is verified (server-side cache)
 */
export async function isIdentityVerified(identityKey: string): Promise<boolean> {
  return hasValidCachedVerification(identityKey);
}

/**
 * Public helper: get verified status and TTL remaining (if available)
 */
export async function getVerificationStatus(identityKey: string): Promise<{ verified: boolean; ttlSeconds: number | null }> {
  const cacheKey = getCacheKey(identityKey);
  try {
    const redis = getTurnstileRedis();
    if (redis) {
      const ttl = await redis.ttl(cacheKey);
      if (typeof ttl === 'number' && ttl > 0) {
        return { verified: true, ttlSeconds: ttl };
      }
    }
  } catch (e) {
    console.warn('[Turnstile] Redis TTL check failed:', e);
  }
  // Fallback to in-memory; estimate TTL (not exact)
  const cached = verificationCache.get(cacheKey);
  if (!cached) return { verified: false, ttlSeconds: null };
  const elapsedMs = Date.now() - cached.verifiedAt;
  const remainMs = Math.max(0, getTurnstileConfig().cacheDuration - elapsedMs);
  return { verified: remainMs > 0, ttlSeconds: Math.floor(remainMs / 1000) };
}

/**
 * Cache successful Turnstile verification
 * 
 * @param identityKey - User identity key
 * @param ip - Client IP address
 * @param token - Verified token
 * @param action - Optional action identifier
 */
export async function cacheVerification(identityKey: string, token: string, action?: string): Promise<void> {
  const cacheKey = getCacheKey(identityKey);
  const now = Date.now();
  // 1) Write to Redis with TTL
  try {
    const redis = getTurnstileRedis();
    if (redis) {
      const ttlSeconds = Math.max(1, Math.floor(getTurnstileConfig().cacheDuration / 1000));
      await redis.set(cacheKey, '1', { ex: ttlSeconds });
    }
  } catch (e) {
    console.warn('[Turnstile] Redis cache set failed:', e);
  }
  // 2) Local memory cache as fast fallback
  verificationCache.set(cacheKey, { token, verifiedAt: now, action });
}

/**
 * Apply Turnstile verification check
 * 
 * This function should be called in the rate limiting middleware
 * to check if the user needs to complete Turnstile verification.
 * 
 * @param request - Next.js request object
 * @param identityKey - User identity from rate limiter
 * @returns Verification result
 */
export async function applyTurnstileVerification(
  request: NextRequest,
  identityKey: string
): Promise<TurnstileVerificationResult> {
  const config = getTurnstileConfig();
  const ip = getClientIP(request);

  // Check if Turnstile is enabled
  if (!config.enabled) {
    return {
      verified: true,
      required: false,
      bypassReason: 'disabled',
    };
  }

  // Check if Turnstile is required for this user
  if (!isTurnstileRequired(identityKey, request)) {
    return {
      verified: true,
      required: false,
      bypassReason: identityKey.startsWith('jwt:') || identityKey.startsWith('session:') 
        ? 'authenticated' 
        : 'disabled',
    };
  }

  // Check for valid cached verification
  if (await hasValidCachedVerification(identityKey)) {
    return {
      verified: true,
      required: true,
      bypassReason: 'cached',
    };
  }

  // At this point, user needs to complete Turnstile challenge
  // API calls should NOT verify tokens directly - that happens in /api/turnstile/verify
  // This middleware just checks if verification was completed recently
  
  console.log('[Turnstile] No valid cached verification for identity:', identityKey);
  console.log('[Turnstile] User must complete Turnstile challenge first');
  
  return {
    verified: false,
    required: true,
    error: 'Turnstile verification required - please complete the security challenge',
  };
}

/**
 * Get Turnstile site key for client-side rendering
 * 
 * @returns Site key or null if not configured
 */
export function getTurnstileSiteKey(): string | null {
  const config = getTurnstileConfig();
  return config.enabled ? config.siteKey || null : null;
}

/**
 * Clear verification cache for a specific identity
 * Useful for testing or manual cache invalidation
 * 
 * @param identityKey - User identity key
 * @param ip - Client IP address
 */
export async function clearVerificationCache(identityKey: string): Promise<void> {
  const cacheKey = getCacheKey(identityKey);
  try {
    const redis = getTurnstileRedis();
    if (redis) await redis.del(cacheKey);
  } catch (e) {
    console.warn('[Turnstile] Redis cache delete failed:', e);
  }
  verificationCache.delete(cacheKey);
}

/**
 * Get verification cache stats for monitoring
 */
export function getVerificationCacheStats() {
  const now = Date.now();
  const config = getTurnstileConfig();
  let validEntries = 0;
  let expiredEntries = 0;

  for (const cache of verificationCache.values()) {
    if (now - cache.verifiedAt < config.cacheDuration) {
      validEntries++;
    } else {
      expiredEntries++;
    }
  }

  return {
    totalEntries: verificationCache.size,
    validEntries,
    expiredEntries,
    cacheDurationMs: config.cacheDuration,
  };
}
