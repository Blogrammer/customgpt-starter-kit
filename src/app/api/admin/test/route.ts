import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit } from '@/lib/rate-limiter';
import { getIdentityKey } from '@/lib/identity';

/**
 * Test endpoint for interactive rate limiting demonstration
 * This endpoint applies rate limiting and returns detailed information
 */
export async function POST(request: NextRequest) {
  try {
    const startTime = Date.now();
    
    // Get identity for this request
    const identityKey = await getIdentityKey(request);
    
    // Apply rate limiting
    const rateLimitResult = await applyRateLimit(request);
    
    const processingTime = Date.now() - startTime;
    
    if (!rateLimitResult.allowed) {
      // Rate limit exceeded
      const retryAfter = rateLimitResult.resetTime - Math.floor(Date.now() / 1000);
      
      return NextResponse.json(
        {
          success: false,
          error: 'Rate limit exceeded',
          message: `Too many requests. Try again in ${retryAfter} seconds.`,
          code: 'RATE_LIMIT_EXCEEDED',
          details: {
            identityKey: identityKey.split(':')[0] + ':***', // Partial for privacy
            identityType: identityKey.split(':')[0],
            window: rateLimitResult.window,
            limit: rateLimitResult.limit,
            remaining: rateLimitResult.remaining,
            resetTime: rateLimitResult.resetTime,
            retryAfter,
            processingTime
          }
        },
        { 
          status: 429,
          headers: rateLimitResult.headers
        }
      );
    }
    
    // Request allowed
    return NextResponse.json(
      {
        success: true,
        message: 'Request processed successfully',
        data: {
          timestamp: new Date().toISOString(),
          requestId: crypto.randomUUID(),
          processingTime
        },
        rateLimit: {
          identityKey: identityKey.split(':')[0] + ':***',
          identityType: identityKey.split(':')[0],
          window: rateLimitResult.window,
          limit: rateLimitResult.limit,
          remaining: rateLimitResult.remaining,
          resetTime: rateLimitResult.resetTime,
          resetIn: rateLimitResult.resetTime - Math.floor(Date.now() / 1000)
        }
      },
      {
        status: 200,
        headers: rateLimitResult.headers
      }
    );
    
  } catch (error) {
    console.error('[ADMIN_TEST] Error:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: 'Failed to process test request'
      },
      { status: 500 }
    );
  }
}

/**
 * Get current rate limit status without consuming a request
 */
export async function GET(request: NextRequest) {
  try {
    const identityKey = await getIdentityKey(request);
    
    // Get current status without incrementing counters
    // We'll read the current Redis values directly
    const { Redis } = await import('@upstash/redis');
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    
    if (!url || !token) {
      return NextResponse.json({
        success: false,
        error: 'Redis not configured'
      }, { status: 503 });
    }
    
    const redis = new Redis({ url, token });
    const now = Math.floor(Date.now() / 1000);
    const minuteWindow = now - (now % 60);
    const hourWindow = now - (now % 3600);
    const dayWindow = now - (now % 86400);
    
    // Get current counts
    const [minuteCount, hourCount, dayCount] = await Promise.all([
      redis.get(`rate:minute:${minuteWindow}:${identityKey}`) || 0,
      redis.get(`rate:hour:${hourWindow}:${identityKey}`) || 0,
      redis.get(`rate:day:${dayWindow}:${identityKey}`) || 0,
    ]);
    
    // Get config for limits
    const { getIdentityConfig } = await import('@/lib/identity');
    const config = getIdentityConfig();
    const limits = config.limits.global;
    
    // Ensure counts don't exceed limits (fix for 3/2 bug)
    const minuteCurrent = Math.min(Number(minuteCount), limits.minute);
    const hourCurrent = Math.min(Number(hourCount), limits.hour);
    const dayCurrent = Math.min(Number(dayCount), limits.day);
    
    return NextResponse.json({
      success: true,
      identity: {
        key: identityKey.split(':')[0] + ':***',
        type: identityKey.split(':')[0]
      },
      windows: {
        minute: {
          current: minuteCurrent,
          limit: limits.minute,
          remaining: Math.max(0, limits.minute - minuteCurrent),
          resetTime: minuteWindow + 60,
          resetIn: (minuteWindow + 60) - now
        },
        hour: {
          current: hourCurrent,
          limit: limits.hour,
          remaining: Math.max(0, limits.hour - hourCurrent),
          resetTime: hourWindow + 3600,
          resetIn: (hourWindow + 3600) - now
        },
        day: {
          current: dayCurrent,
          limit: limits.day,
          remaining: Math.max(0, limits.day - dayCurrent),
          resetTime: dayWindow + 86400,
          resetIn: (dayWindow + 86400) - now
        }
      },
      config: {
        limits: limits,
        routesInScope: config.routesInScope
      }
    });
    
  } catch (error) {
    console.error('[ADMIN_TEST] Status error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get status' },
      { status: 500 }
    );
  }
}
