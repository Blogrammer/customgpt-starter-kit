/**
 * Cloudflare Turnstile Token Verification API
 * 
 * Server-side endpoint for verifying Turnstile challenge tokens.
 * Implements security best practices including:
 * - Server-side only verification (no client-side trust)
 * - Token replay attack prevention
 * - Comprehensive error handling and logging
 * - Rate limiting on verification endpoint
 * - Secure communication with Cloudflare API
 * 
 * Security Features:
 * - All verification happens server-side
 * - No secrets exposed to client
 * - HTTPS enforced for Cloudflare API calls
 * - Request timeout prevents hanging
 * - Comprehensive error categorization
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { z } from 'zod';
import { isIdentityVerified, getVerificationStatus } from '@/lib/turnstile-verification';

// Cloudflare Turnstile verification endpoint
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Request validation schema
const VerifyRequestSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  action: z.string().optional(),
});

// Cloudflare API response types
interface TurnstileVerifyResponse {
  success: boolean;
  'challenge_ts'?: string;
  hostname?: string;
  'error-codes'?: string[];
  action?: string;
  cdata?: string;
}

// Our API response types
interface VerifySuccessResponse {
  success: true;
  challengeTs: string;
  hostname: string;
  action?: string;
  cdata?: string;
}

interface VerifyErrorResponse {
  success: false;
  errorCodes: string[];
  message: string;
}

// Error code translations for user-friendly messages
const ERROR_MESSAGES: Record<string, string> = {
  'missing-input-secret': 'Server configuration error',
  'invalid-input-secret': 'Server configuration error',
  'missing-input-response': 'Missing verification token',
  'invalid-input-response': 'Invalid verification token',
  'bad-request': 'Invalid request format',
  'timeout-or-duplicate': 'Token has expired or already been used',
  'internal-error': 'Verification service temporarily unavailable',
  'invalid-widget-id': 'Invalid widget configuration',
  'invalid-parsed-secret': 'Server configuration error',
};

// Token cache for replay prevention (in production, use Redis)
const usedTokens = new Set<string>();

// Clean up old tokens every 10 minutes
setInterval(() => {
  usedTokens.clear();
}, 10 * 60 * 1000);

/**
 * Verify Turnstile token with Cloudflare
 * 
 * @param token - Turnstile response token
 * @param remoteip - Client IP address
 * @param action - Optional action identifier
 * @returns Promise<TurnstileVerifyResponse>
 */
async function verifyWithCloudflare(
  token: string, 
  remoteip?: string, 
  action?: string
): Promise<TurnstileVerifyResponse> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  
  if (!secretKey) {
    throw new Error('TURNSTILE_SECRET_KEY not configured');
  }

  // Prepare form data
  const formData = new FormData();
  formData.append('secret', secretKey);
  formData.append('response', token);
  
  if (remoteip) {
    formData.append('remoteip', remoteip);
  }
  
  if (action) {
    formData.append('action', action);
  }

  // Make request to Cloudflare with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
      headers: {
        'User-Agent': 'CustomGPT-Starter-Kit/1.0',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Cloudflare API error: ${response.status} ${response.statusText}`);
    }

    const result: TurnstileVerifyResponse = await response.json();
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Verification request timeout');
    }
    
    throw error;
  }
}

/**
 * Get client IP address from request headers
 */
function getClientIP(request: NextRequest): string | undefined {
  const headersList = headers();
  
  // Check various headers for client IP
  const forwardedFor = headersList.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIP = headersList.get('x-real-ip');
  if (realIP) {
    return realIP.trim();
  }

  const cfConnectingIP = headersList.get('cf-connecting-ip');
  if (cfConnectingIP) {
    return cfConnectingIP.trim();
  }

  return request.ip;
}

/**
 * Log verification attempt for monitoring
 */
function logVerificationAttempt(
  success: boolean,
  token: string,
  ip?: string,
  errorCodes?: string[],
  action?: string
) {
  const logData = {
    timestamp: new Date().toISOString(),
    type: 'turnstile_verification',
    success,
    ip: ip ? `${ip.slice(0, 8)}***` : 'unknown', // Partial IP for privacy
    tokenPrefix: token.slice(0, 8), // First 8 chars for debugging
    errorCodes,
    action,
    userAgent: headers().get('user-agent')?.slice(0, 100), // Truncated UA
  };

  console.log('[Turnstile]', JSON.stringify(logData));
}

/**
 * POST /api/turnstile/verify
 * 
 * Verify a Turnstile challenge token
 * 
 * Body: { token: string, action?: string }
 * Returns: VerifySuccessResponse | VerifyErrorResponse
 */
export async function POST(request: NextRequest) {
  try {
    // Lightweight per-identity rate limit: 5 requests/minute
    try {
      const { getIdentityKey } = await import('@/lib/identity');
      const { Redis } = await import('@upstash/redis');
      const url = process.env.UPSTASH_REDIS_REST_URL;
      const token = process.env.UPSTASH_REDIS_REST_TOKEN;
      if (url && token) {
        const rlRedis = new Redis({ url, token });
        const identityKey = await getIdentityKey(request);
        const key = `turnstile:rl:${identityKey}:minute:${Math.floor(Date.now()/60000)}`;
        const count = await rlRedis.incr(key);
        await rlRedis.expire(key, 60);
        if (count > 5) {
          return NextResponse.json({ success: false, errorCodes: ['rate-limited'], message: 'Too many verification attempts' }, { status: 429 });
        }
      }
    } catch {}
    // Check if Turnstile is enabled
    if (process.env.TURNSTILE_ENABLED !== 'true') {
      return NextResponse.json(
        {
          success: false,
          errorCodes: ['service-disabled'],
          message: 'Turnstile verification is disabled'
        } satisfies VerifyErrorResponse,
        { status: 503 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const parseResult = VerifyRequestSchema.safeParse(body);
    
    if (!parseResult.success) {
      const errorMessage = parseResult.error.errors.map(e => e.message).join(', ');
      return NextResponse.json(
        {
          success: false,
          errorCodes: ['invalid-request'],
          message: errorMessage
        } satisfies VerifyErrorResponse,
        { status: 400 }
      );
    }

    const { token, action } = parseResult.data;

    // Check for token replay (basic prevention)
    if (usedTokens.has(token)) {
      logVerificationAttempt(false, token, getClientIP(request), ['token-replay'], action);
      
      return NextResponse.json(
        {
          success: false,
          errorCodes: ['timeout-or-duplicate'],
          message: 'Token has already been used'
        } satisfies VerifyErrorResponse,
        { status: 400 }
      );
    }

    // Get client IP
    const clientIP = getClientIP(request);

    // Verify with Cloudflare
    const verificationResult = await verifyWithCloudflare(token, clientIP, action);

    if (verificationResult.success) {
      // Mark token as used
      usedTokens.add(token);

      // Cache the verification using the SAME identity system as rate limiter
      try {
        const { getIdentityKey } = await import('@/lib/identity');
        const { cacheVerification } = await import('@/lib/turnstile-verification');
        
        // Use the exact same identity generation as the rate limiter
        const identityKey = await getIdentityKey(request);
        await cacheVerification(identityKey, token, action);
        
        console.log('[Turnstile] Cached verification for identity:', identityKey.split(':')[0] + ':***');
      } catch (error) {
        console.warn('[Turnstile] Failed to cache verification:', error);
      }

      // Log successful verification
      logVerificationAttempt(true, token, clientIP, undefined, action);

      // Return success response
      const response: VerifySuccessResponse = {
        success: true,
        challengeTs: verificationResult['challenge_ts'] || new Date().toISOString(),
        hostname: verificationResult.hostname || 'unknown',
        action: verificationResult.action,
        cdata: verificationResult.cdata,
      };

      return NextResponse.json(response);
    } else {
      // Handle verification failure
      const errorCodes = verificationResult['error-codes'] || ['unknown-error'];
      
      // Log failed verification
      logVerificationAttempt(false, token, clientIP, errorCodes, action);

      // Map error codes to user-friendly messages
      const primaryError = errorCodes[0];
      const message = ERROR_MESSAGES[primaryError] || 'Verification failed';

      const response: VerifyErrorResponse = {
        success: false,
        errorCodes,
        message,
      };

      // Determine appropriate HTTP status code
      const status = primaryError === 'timeout-or-duplicate' ? 400 :
                   primaryError === 'internal-error' ? 503 :
                   primaryError.includes('secret') ? 500 : 400;

      return NextResponse.json(response, { status });
    }
  } catch (error) {
    console.error('[Turnstile] Verification error:', error);

    // Log error attempt
    try {
      const body = await request.clone().json();
      logVerificationAttempt(false, body.token || 'unknown', getClientIP(request), ['server-error']);
    } catch {
      // Ignore logging errors
    }

    // Return generic error response
    return NextResponse.json(
      {
        success: false,
        errorCodes: ['internal-error'],
        message: 'Verification service temporarily unavailable'
      } satisfies VerifyErrorResponse,
      { status: 500 }
    );
  }
}

/**
 * GET /api/turnstile/verify
 * 
 * Health check endpoint for Turnstile verification service
 */
export async function GET() {
  const isEnabled = process.env.TURNSTILE_ENABLED === 'true';
  const hasSecretKey = !!process.env.TURNSTILE_SECRET_KEY;
  const hasSiteKey = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  let verified = false;
  let ttlSeconds: number | null = null;
  try {
    const { getIdentityKey } = await import('@/lib/identity');
    // Build a minimal NextRequest-like object isn't needed; in Next API route GET has request context
    // Here we rely on the same identity resolution as middleware will use
    const req = (await import('next/server')).NextRequest;
  } catch {}
  try {
    const { getIdentityKey } = await import('@/lib/identity');
    // We do not have direct request here; in Next 14 route handlers have access to headers/cookies via next/headers
    // So construct a dummy NextRequest is not necessary: identity.getIdentityKey uses request; create one via new NextRequest
  } catch {}
  // Simpler: expose only configuration in this GET, and add a status subpath handler below
  return NextResponse.json({ enabled: isEnabled, configured: hasSecretKey && hasSiteKey, timestamp: new Date().toISOString() });
}

// Note: GET_status was removed as it's not a valid Next.js route export
// If you need a status endpoint, create a separate route file at:
// src/app/api/turnstile/verify/status/route.ts

// Export types for use in other files
export type { VerifySuccessResponse, VerifyErrorResponse };
