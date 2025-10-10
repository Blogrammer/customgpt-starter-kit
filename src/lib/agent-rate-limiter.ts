/**
 * Agent-Specific Rate Limiting System
 * 
 * Provides per-agent/project rate limiting with:
 * - Individual agent query limits
 * - IP blocking and custom limits
 * - Query-based counting (not just requests)
 * - Flexible configuration per agent
 */

import { NextRequest } from 'next/server';
import { Redis } from '@upstash/redis';
import { getIdentityKey } from './identity';

// Types
export interface AgentRateLimitConfig {
  agentId: string;
  agentName?: string;
  limits: {
    queriesPerMinute?: number;
    queriesPerHour?: number;
    queriesPerDay?: number;
    queriesPerMonth?: number;
  };
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface IPBlockConfig {
  ip: string;
  type: 'block' | 'custom_limit';
  customLimits?: {
    queriesPerMinute?: number;
    queriesPerHour?: number;
    queriesPerDay?: number;
    queriesPerMonth?: number;
  };
  reason?: string;
  expiresAt?: string; // ISO date string, null for permanent
  createdAt: string;
  createdBy?: string;
}

export interface AgentRateLimitResult {
  allowed: boolean;
  agentId: string;
  window: 'minute' | 'hour' | 'day' | 'month';
  limit: number;
  remaining: number;
  resetTime: number;
  blocked?: boolean;
  blockReason?: string;
}

// Redis keys
const AGENT_CONFIG_PREFIX = 'agent:ratelimit:config:';
const AGENT_COUNTER_PREFIX = 'agent:ratelimit:counter:';
const IP_BLOCK_PREFIX = 'ip:block:';
const IP_CUSTOM_LIMIT_PREFIX = 'ip:customlimit:';

// Get Redis client
function getRedis(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  
  if (!url || !token) {
    throw new Error('Redis configuration missing');
  }
  
  return new Redis({ url, token });
}

// Helper: Upstash auto (de)serializes JSON. Be resilient to strings/objects.
function parseMaybe<T>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T; } catch { return null; }
  }
  return value as T;
}

/**
 * Extract agent ID from request path
 */
export function extractAgentId(request: NextRequest): string | null {
  const url = new URL(request.url);
  const pathname = url.pathname;
  
  // Match patterns like:
  // /api/proxy/projects/{projectId}/conversations
  // /api/proxy/agents/{agentId}/...
  // /api/proxy/chatbot/{agentId}/...
  
  const patterns = [
    /\/api\/proxy\/projects\/([^\/]+)/,
    /\/api\/proxy\/agents\/([^\/]+)/,
    /\/api\/proxy\/chatbot\/([^\/]+)/,
    /\/projects\/([^\/]+)\/conversations/,
  ];
  
  for (const pattern of patterns) {
    const match = pathname.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  // Also check request body for agent_id or project_id
  return null;
}

/**
 * Check if an IP is blocked
 */
export async function checkIPBlock(ip: string): Promise<{ blocked: boolean; reason?: string }> {
  try {
    const redis = getRedis();
    const blockData = await redis.get(`${IP_BLOCK_PREFIX}${ip}`);
    
    if (!blockData) {
      return { blocked: false };
    }
    
    const config = blockData as IPBlockConfig;
    
    // Check if block has expired
    if (config.expiresAt && new Date(config.expiresAt) < new Date()) {
      await redis.del(`${IP_BLOCK_PREFIX}${ip}`);
      return { blocked: false };
    }
    
    if (config.type === 'block') {
      return { blocked: true, reason: config.reason || 'IP blocked' };
    }
    
    return { blocked: false };
  } catch (error) {
    console.error('[AgentRateLimiter] Error checking IP block:', error);
    return { blocked: false };
  }
}

/**
 * Get custom IP limits if configured
 */
export async function getIPCustomLimits(ip: string): Promise<IPBlockConfig['customLimits'] | null> {
  try {
    const redis = getRedis();
    const configData = await redis.get(`${IP_CUSTOM_LIMIT_PREFIX}${ip}`);
    
    if (!configData) {
      return null;
    }
    
    const config = configData as IPBlockConfig;
    
    // Check if custom limit has expired
    if (config.expiresAt && new Date(config.expiresAt) < new Date()) {
      await redis.del(`${IP_CUSTOM_LIMIT_PREFIX}${ip}`);
      return null;
    }
    
    return config.customLimits || null;
  } catch (error) {
    console.error('[AgentRateLimiter] Error getting IP custom limits:', error);
    return null;
  }
}

/**
 * Extract raw client IP (normalized) from request headers without hashing
 */
function getRawClientIp(request: NextRequest): string {
  // Get IP from various headers (Vercel, Cloudflare, proxies)
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip');

  let ip = forwardedFor?.split(',')[0]?.trim() || realIp || cfConnectingIp || (request as any).ip || '127.0.0.1';

  // Normalize common variants
  if (ip === '::1') ip = '127.0.0.1';
  if (ip?.startsWith('::ffff:')) ip = ip.substring('::ffff:'.length);
  return (ip || '').toLowerCase();
}

/**
 * Set or update agent rate limit configuration
 */
export async function setAgentRateLimit(config: AgentRateLimitConfig): Promise<void> {
  const redis = getRedis();
  const key = `${AGENT_CONFIG_PREFIX}${config.agentId}`;
  const payload: AgentRateLimitConfig = {
    ...config,
    updatedAt: new Date().toISOString(),
    createdAt: config.createdAt || new Date().toISOString(),
  };
  await redis.set(key, payload);
}

/**
 * Get agent rate limit configuration
 */
export async function getAgentRateLimit(agentId: string): Promise<AgentRateLimitConfig | null> {
  try {
    const redis = getRedis();
    const key = `${AGENT_CONFIG_PREFIX}${agentId}`;
    const data = await redis.get(key);
    if (!data) {
      return null;
    }
    const parsed = parseMaybe<AgentRateLimitConfig>(data);
    return parsed;
  } catch (error) {
    console.error('[AgentRateLimiter] Error getting agent config:', error);
    return null;
  }
}

/**
 * Get all agent rate limit configurations
 */
export async function getAllAgentRateLimits(): Promise<AgentRateLimitConfig[]> {
  try {
    const redis = getRedis();
    const keys = await redis.keys(`${AGENT_CONFIG_PREFIX}*`);
    
    if (keys.length === 0) {
      return [];
    }
    
    const configs: AgentRateLimitConfig[] = [];
    for (const key of keys) {
      const data = await redis.get(key);
      const parsed = parseMaybe<AgentRateLimitConfig>(data);
      if (parsed) configs.push(parsed);
    }
    
    return configs;
  } catch (error) {
    console.error('[AgentRateLimiter] Error getting all agent configs:', error);
    return [];
  }
}

/**
 * Delete agent rate limit configuration
 */
export async function deleteAgentRateLimit(agentId: string): Promise<void> {
  const redis = getRedis();
  const key = `${AGENT_CONFIG_PREFIX}${agentId}`;
  await redis.del(key);
  
  // Also clear any existing counters
  const counterKeys = await redis.keys(`${AGENT_COUNTER_PREFIX}*:${agentId}:*`);
  if (counterKeys.length > 0) {
    await Promise.all(counterKeys.map(k => redis.del(k)));
  }
}

/**
 * Block or unblock an IP
 */
export async function setIPBlock(config: IPBlockConfig): Promise<void> {
  const redis = getRedis();
  
  if (config.type === 'block') {
    const key = `${IP_BLOCK_PREFIX}${config.ip}`;
    const payload: IPBlockConfig = {
      ...config,
      createdAt: config.createdAt || new Date().toISOString()
    };
    const ttlSeconds = config.expiresAt ? Math.max(1, Math.floor((new Date(config.expiresAt).getTime() - Date.now()) / 1000)) : undefined;
    if (ttlSeconds) {
      await redis.set(key, payload, { ex: ttlSeconds });
    } else {
      await redis.set(key, payload);
    }
  } else if (config.type === 'custom_limit') {
    const key = `${IP_CUSTOM_LIMIT_PREFIX}${config.ip}`;
    const payload: IPBlockConfig = {
      ...config,
      createdAt: config.createdAt || new Date().toISOString()
    };
    const ttlSeconds = config.expiresAt ? Math.max(1, Math.floor((new Date(config.expiresAt).getTime() - Date.now()) / 1000)) : undefined;
    if (ttlSeconds) {
      await redis.set(key, payload, { ex: ttlSeconds });
    } else {
      await redis.set(key, payload);
    }
  }
}

/**
 * Remove IP block or custom limit
 */
export async function removeIPBlock(ip: string): Promise<void> {
  const redis = getRedis();
  await Promise.all([
    redis.del(`${IP_BLOCK_PREFIX}${ip}`),
    redis.del(`${IP_CUSTOM_LIMIT_PREFIX}${ip}`)
  ]);
}

/**
 * Get all blocked IPs
 */
export async function getAllBlockedIPs(): Promise<IPBlockConfig[]> {
  try {
    const redis = getRedis();
    const blockKeys = await redis.keys(`${IP_BLOCK_PREFIX}*`);
    const customKeys = await redis.keys(`${IP_CUSTOM_LIMIT_PREFIX}*`);
    
    const configs: IPBlockConfig[] = [];
    
    for (const key of [...blockKeys, ...customKeys]) {
      const data = await redis.get(key);
      if (data) {
        const parsed = parseMaybe<IPBlockConfig>(data) || {} as any;
        // Extract IP from key
        if (key.startsWith(IP_BLOCK_PREFIX)) {
          parsed.ip = key.replace(IP_BLOCK_PREFIX, '');
        } else {
          parsed.ip = key.replace(IP_CUSTOM_LIMIT_PREFIX, '');
        }
        configs.push(parsed as IPBlockConfig);
      }
    }
    
    return configs;
  } catch (error) {
    console.error('[AgentRateLimiter] Error getting blocked IPs:', error);
    return [];
  }
}

/**
 * Apply agent-specific rate limiting
 */
export async function applyAgentRateLimit(
  request: NextRequest,
  agentId: string
): Promise<AgentRateLimitResult> {
  try {
    const redis = getRedis();
    const identity = await getIdentityKey(request);
    const ip = getRawClientIp(request);
    
    // Check IP block first
    const ipBlock = await checkIPBlock(ip);
    if (ipBlock.blocked) {
      return {
        allowed: false,
        agentId,
        window: 'minute',
        limit: 0,
        remaining: 0,
        resetTime: Math.floor(Date.now() / 1000) + 3600,
        blocked: true,
        blockReason: ipBlock.reason
      };
    }
    
    // Get agent configuration
    const agentConfig = await getAgentRateLimit(agentId);
    if (!agentConfig || !agentConfig.enabled) {
      // No agent-specific limits configured
      return {
        allowed: true,
        agentId,
        window: 'hour',
        limit: 999999,
        remaining: 999999,
        resetTime: Math.floor(Date.now() / 1000) + 3600
      };
    }
    
    // Check for custom IP limits
    const customLimits = await getIPCustomLimits(ip);
    const limits = customLimits || agentConfig.limits;
    
    const now = Math.floor(Date.now() / 1000);
    const windows = [
      { name: 'minute' as const, seconds: 60, limit: limits.queriesPerMinute },
      { name: 'hour' as const, seconds: 3600, limit: limits.queriesPerHour },
      { name: 'day' as const, seconds: 86400, limit: limits.queriesPerDay },
      { name: 'month' as const, seconds: 2592000, limit: limits.queriesPerMonth }
    ];
    
    // Check all configured windows
    for (const window of windows) {
      if (!window.limit) continue;
      
      const windowStart = now - (now % window.seconds);
      const key = `${AGENT_COUNTER_PREFIX}${window.name}:${agentId}:${identity}`;
      
      // Get current count
      const currentCount = await redis.get(key) || 0;
      const count = Number(currentCount);
      
      if (count >= window.limit) {
        // Rate limit exceeded
        return {
          allowed: false,
          agentId,
          window: window.name,
          limit: window.limit,
          remaining: 0,
          resetTime: windowStart + window.seconds
        };
      }
    }
    
    // Increment counters for all windows
    const increments = windows
      .filter(w => w.limit)
      .map(async (window) => {
        const windowStart = now - (now % window.seconds);
        const key = `${AGENT_COUNTER_PREFIX}${window.name}:${agentId}:${identity}`;
        const ttl = window.seconds;
        
        const newCount = await redis.incr(key);
        await redis.expire(key, ttl);
        
        return { window: window.name, count: newCount, limit: window.limit };
      });
    
    const results = await Promise.all(increments);
    
    // Find the most restrictive window
    let mostRestrictive = results[0];
    for (const result of results) {
      if (result.limit) {
        const remaining = result.limit - result.count;
        const currentRemaining = mostRestrictive.limit! - mostRestrictive.count;
        if (remaining < currentRemaining) {
          mostRestrictive = result;
        }
      }
    }
    
    const windowConfig = windows.find(w => w.name === mostRestrictive.window)!;
    const windowStart = now - (now % windowConfig.seconds);
    
    return {
      allowed: true,
      agentId,
      window: mostRestrictive.window as any,
      limit: mostRestrictive.limit!,
      remaining: Math.max(0, mostRestrictive.limit! - mostRestrictive.count),
      resetTime: windowStart + windowConfig.seconds
    };
  } catch (error) {
    console.error('[AgentRateLimiter] Error applying rate limit:', error);
    // Fail open on error
    return {
      allowed: true,
      agentId,
      window: 'hour',
      limit: 999999,
      remaining: 999999,
      resetTime: Math.floor(Date.now() / 1000) + 3600
    };
  }
}

/**
 * Reset agent counters
 */
export async function resetAgentCounters(
  agentId: string,
  identity?: string,
  window?: 'minute' | 'hour' | 'day' | 'month'
): Promise<void> {
  const redis = getRedis();
  
  let pattern = `${AGENT_COUNTER_PREFIX}`;
  if (window) {
    pattern += `${window}:`;
  } else {
    pattern += `*:`;
  }
  pattern += `${agentId}:`;
  if (identity) {
    pattern += identity;
  } else {
    pattern += '*';
  }
  
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await Promise.all(keys.map(k => redis.del(k)));
  }
}

/**
 * Get agent usage statistics
 */
export async function getAgentUsageStats(agentId: string): Promise<{
  minute: { [identity: string]: number };
  hour: { [identity: string]: number };
  day: { [identity: string]: number };
  month: { [identity: string]: number };
}> {
  try {
    const redis = getRedis();
    const stats = {
      minute: {} as { [identity: string]: number },
      hour: {} as { [identity: string]: number },
      day: {} as { [identity: string]: number },
      month: {} as { [identity: string]: number }
    };
    
    const windows = ['minute', 'hour', 'day', 'month'] as const;
    
    for (const window of windows) {
      const keys = await redis.keys(`${AGENT_COUNTER_PREFIX}${window}:${agentId}:*`);
      
      for (const key of keys) {
        const count = await redis.get(key);
        const identity = key.split(':').pop()!;
        stats[window][identity] = Number(count) || 0;
      }
    }
    
    return stats;
  } catch (error) {
    console.error('[AgentRateLimiter] Error getting usage stats:', error);
    return {
      minute: {},
      hour: {},
      day: {},
      month: {}
    };
  }
}
