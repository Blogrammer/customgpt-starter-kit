import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

// Basic schema guard; keep permissive and validate shapes in UI
function isObject(value: any) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error('Redis not configured');
  }
  return new Redis({ url, token });
}

const CONFIG_KEY = 'admin:rate-limit-config';

export async function GET() {
  try {
    const redis = getRedis();
    const override = await redis.get(CONFIG_KEY);
    // Also return file defaults for visibility
    let fileDefaults: any = {};
    try {
      const fs = await import('fs');
      const path = await import('path');
      const p = path.join(process.cwd(), 'config', 'rate-limits.json');
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        fileDefaults = JSON.parse(raw);
      }
    } catch {}
    return NextResponse.json({ success: true, data: { defaults: fileDefaults, override } });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to load config' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!isObject(body)) {
      return NextResponse.json({ success: false, error: 'Invalid config payload' }, { status: 400 });
    }

    // Support both canonical and UI-friendly payloads
    let canonical: any = body;
    const isUiStyle = isObject(body.global) && typeof body.global.defaultPerMinute === 'number';
    if (isUiStyle) {
      canonical = {
        limits: {
          global: {
            minute: body.global.defaultPerMinute,
            hour: body.global.defaultPerHour,
            day: body.global.defaultPerDay,
            month: (body.global.defaultPerMonth ?? 300000)
          }
        },
        routes: body.routes || {},
        identityMultipliers: body.identityMultipliers || { jwt: 2.0, session: 1.5, ip: 1.0 },
        routesInScope: Array.isArray(body.routesInScope) ? body.routesInScope : undefined,
        rateLimitingEnabled: body.rateLimitingEnabled !== undefined ? !!body.rateLimitingEnabled : true,
      };
    }

    // Minimal shape checks to prevent bad writes (canonical form)
    if (!isObject(canonical.limits) || !isObject(canonical.limits.global)) {
      return NextResponse.json({ success: false, error: 'Missing limits.global' }, { status: 400 });
    }
    const g = canonical.limits.global;
    for (const k of ['minute', 'hour', 'day', 'month']) {
      if (typeof g[k] !== 'number' || g[k] < 0) {
        return NextResponse.json({ success: false, error: `limits.global.${k} must be a non-negative number` }, { status: 400 });
      }
    }


    const redis = getRedis();
    await redis.set(CONFIG_KEY, canonical);
    
    // Force refresh the configuration cache
    const { refreshRedisConfig } = await import('@/lib/identity');
    await refreshRedisConfig();
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to save config' }, { status: 500 });
  }
}


