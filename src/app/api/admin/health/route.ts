import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return null;
  }
  return new Redis({ url, token });
}

export async function GET(_request: NextRequest) {
  const health: any = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
    services: {
      redis: { connected: false, details: '' },
      turnstile: { enabled: process.env.TURNSTILE_ENABLED === 'true', configured: !!process.env.TURNSTILE_SECRET_KEY },
    }
  };

  // Check Redis connectivity
  try {
    const redis = getRedis();
    if (redis) {
      // Prefer ping if available
      try {
        // @ts-ignore
        const pong = await (redis as any).ping?.();
        if (pong === 'PONG') {
          health.services.redis.connected = true;
          health.services.redis.details = 'ping ok';
        } else {
          const key = `admin:health:check:${Math.floor(Date.now()/1000)}`;
          await redis.set(key, '1', { ex: 5 });
          const val = await redis.get(key);
          health.services.redis.connected = val === '1';
          health.services.redis.details = 'set/get ok';
        }
      } catch {
        const key = `admin:health:check:${Math.floor(Date.now()/1000)}`;
        await redis.set(key, '1', { ex: 5 });
        const val = await redis.get(key);
        health.services.redis.connected = val === '1';
        health.services.redis.details = 'set/get ok';
      }
    }
  } catch (e) {
    health.services.redis.error = 'connection-failed';
  }

  return NextResponse.json({ success: true, data: health });
}


