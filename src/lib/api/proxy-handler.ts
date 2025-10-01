import { NextRequest, NextResponse } from 'next/server';
import { getApiHeaders, getStreamHeaders } from '@/lib/api/headers';
import { 
  enforceDemoLimits, 
  trackResourceCreation, 
  isFreeTrialRequest 
} from '@/lib/api/demo-limits-middleware';
import { DEMO_API_HEADERS } from '@/lib/constants/demo-limits';
import { applyRateLimit, RateLimitError } from '@/lib/rate-limiter';

interface ProxyOptions {
  method?: string;
  body?: any;
  isFormData?: boolean;
  isStream?: boolean;
}

/**
 * Generic proxy handler for CustomGPT API endpoints
 * Handles authentication, error responses, and streaming
 */
export async function proxyRequest(
  apiPath: string,
  request: NextRequest,
  options: ProxyOptions = {}
) {
  try {
    const apiUrl = `https://app.customgpt.ai/api/v1${apiPath}`;
    const method = options.method || request.method;
    
    // Apply rate limiting first (before any other checks)
    let rateLimitHeaders: Record<string, string> = {};
    try {
      const rateLimitResult = await applyRateLimit(request);
      rateLimitHeaders = rateLimitResult.headers;
      
      if (!rateLimitResult.allowed) {
        // Check if this is a Turnstile verification failure
        if (rateLimitResult.window === 'turnstile') {
          console.log('[Proxy] Turnstile verification required:', {
            path: apiPath,
            identity: rateLimitHeaders['X-RateLimit-Identity'],
            error: rateLimitHeaders['X-Turnstile-Error']
          });
          
          return NextResponse.json(
            { 
              error: 'Human verification required',
              message: rateLimitHeaders['X-Turnstile-Error'] || 'Please complete the security verification to continue.',
              code: 'TURNSTILE_VERIFICATION_REQUIRED',
              turnstileRequired: true
            },
            { 
              status: 403, // Use 403 for verification required
              headers: rateLimitHeaders
            }
          );
        }
        
        // Regular rate limit exceeded
        console.log('[Proxy] Rate limit exceeded:', {
          path: apiPath,
          identity: rateLimitHeaders['X-RateLimit-Identity'],
          window: rateLimitResult.window,
          limit: rateLimitResult.limit,
          remaining: rateLimitResult.remaining
        });
        
        return NextResponse.json(
          { 
            error: 'Rate limit exceeded',
            message: `Too many requests. Try again in ${rateLimitHeaders['Retry-After']} seconds.`,
            code: 'RATE_LIMIT_EXCEEDED'
          },
          { 
            status: 429,
            headers: rateLimitHeaders
          }
        );
      }
    } catch (rateLimitError) {
      if (rateLimitError instanceof RateLimitError) {
        return NextResponse.json(
          { 
            error: 'Rate limit exceeded',
            message: `Too many requests. Try again in ${rateLimitError.result.headers['Retry-After']} seconds.`,
            code: 'RATE_LIMIT_EXCEEDED'
          },
          { 
            status: 429,
            headers: rateLimitError.result.headers
          }
        );
      }
      // For other rate limit errors, log but continue (graceful degradation)
      console.warn('[Proxy] Rate limit check failed, allowing request:', rateLimitError);
    }
    
    // Check deployment mode from header
    const deploymentMode = request.headers.get('X-Deployment-Mode') || 'production';
    const isFreeTrialMode = request.headers.get('X-Free-Trial-Mode') === 'true';
    let apiKey: string | undefined;
    
    // Enforce demo limits for free trial mode
    if (isFreeTrialMode) {
      const limitResponse = await enforceDemoLimits(request, apiPath);
      if (limitResponse) {
        return limitResponse; // Return error if limits exceeded
      }
    }
    
    if (deploymentMode === 'demo') {
      if (isFreeTrialMode) {
        // In free trial mode, use the server-side demo API key
        apiKey = process.env.CUSTOMGPT_API_KEY_DEMO_USE_ONLY;
        if (!apiKey) {
          console.error('[Proxy] Free trial mode but no CUSTOMGPT_API_KEY_DEMO_USE_ONLY configured');
          return NextResponse.json(
            { error: 'Free trial is not available. Please use your own API key.' },
            { status: 503 }
          );
        }
      } else {
        // In regular demo mode, get API key from request header
        apiKey = request.headers.get('X-CustomGPT-API-Key') || undefined;
        if (!apiKey) {
          return NextResponse.json(
            { error: 'API key required in demo mode' },
            { status: 401 }
          );
        }
      }
    }
    
    // Build headers for CustomGPT API (only essential headers)
    // IMPORTANT: Only send Authorization and Content-Type, nothing else!
    const headers: Record<string, string> = options.isStream 
      ? getStreamHeaders(apiKey)
      : getApiHeaders(apiKey);
    
    // Store tracking headers separately (for internal use only)
    const trackingHeaders: Record<string, string> = {
      'X-Deployment-Mode': deploymentMode,
      'X-Client-Mode': isFreeTrialMode ? 'free-trial' : deploymentMode,
      'X-Client-Version': process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
      'X-Request-Path': apiPath,
      'X-Request-Timestamp': Date.now().toString(),
    };
    
    // Add session tracking for demos (internal use only)
    if (deploymentMode === 'demo') {
      const sessionId = request.headers.get(DEMO_API_HEADERS.SESSION_ID);
      if (sessionId) {
        trackingHeaders['X-Demo-Session-ID'] = sessionId;
      }
      
      if (isFreeTrialMode) {
        trackingHeaders['X-Demo-Type'] = 'free-trial';
        trackingHeaders['X-Demo-Restrictions'] = 'true';
      } else {
        trackingHeaders['X-Demo-Type'] = 'user-api-key';
        trackingHeaders['X-Demo-Restrictions'] = 'false';
      }
    } else {
      trackingHeaders['X-Demo-Type'] = 'none';
      trackingHeaders['X-Production-Mode'] = 'true';
    }
    
    // Add user agent info (internal use only)
    const userAgent = request.headers.get('user-agent') || 'unknown';
    trackingHeaders['X-Client-User-Agent'] = userAgent;
    
    // Add referer for tracking entry points (internal use only)
    const referer = request.headers.get('referer') || 'direct';
    trackingHeaders['X-Client-Referer'] = referer;
    
    // Log tracking headers for analytics but don't send them to CustomGPT
    console.log('[Proxy] Request tracking:', {
      path: apiPath,
      method,
      deploymentMode,
      isFreeTrialMode,
      hasApiKey: !!apiKey
    });
    
    // Handle form data - don't set content-type for FormData
    if (options.isFormData) {
      delete headers['Content-Type'];
    }
    
    // Build fetch options with explicit control to prevent automatic headers
    const fetchOptions: RequestInit = {
      method,
      headers,
      // Explicitly control redirect behavior
      redirect: 'follow',
      // Don't include credentials
      credentials: 'omit',
      // Don't send referrer information
      referrerPolicy: 'no-referrer',
      // Set referrer to empty string to avoid the error
      referrer: '',
      // Mode
      mode: 'cors',
      // Disable cache to ensure fresh requests
      cache: 'no-store',
    };
    
    // Add body if present
    if (options.body !== undefined) {
      if (options.isFormData) {
        // For FormData, pass the body directly
        fetchOptions.body = options.body;
      } else {
        // For JSON, stringify the body
        fetchOptions.body = JSON.stringify(options.body);
      }
    } else if (method !== 'GET' && method !== 'HEAD') {
      // For non-GET requests without explicit body, try to get body from request
      try {
        const requestBody = await request.json();
        fetchOptions.body = JSON.stringify(requestBody);
      } catch {
        // If no JSON body, that's okay for some endpoints
      }
    }
    
    // Log the request details without exposing sensitive data
    console.log('[Proxy] Sending request to CustomGPT:', {
      url: apiUrl,
      method: fetchOptions.method,
      headers: {
        Authorization: headers.Authorization ? 'Bearer [REDACTED]' : undefined,
        'Content-Type': headers['Content-Type']
      },
      bodyLength: fetchOptions.body ? String(fetchOptions.body).length : 0,
      deploymentMode,
      keySource: deploymentMode === 'demo' ? 
        (isFreeTrialMode ? 'env:DEMO_KEY' : 'header:X-CustomGPT-API-Key') : 
        'env:CUSTOMGPT_API_KEY',
      timestamp: new Date().toISOString()
    });
    
    const response = await fetch(apiUrl, fetchOptions);
    
    // Handle streaming responses
    if (options.isStream && response.ok) {
      // For streaming, we need to return the response directly
      return new Response(response.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }
    
    // Handle non-OK responses
    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText || `API error: ${response.status}` };
      }
      
      console.error(`[Proxy] API error for ${apiPath}:`, {
        status: response.status,
        statusText: response.statusText,
        error: errorData,
        deploymentMode,
        hasApiKey: !!apiKey
      });
      
      // Include tracking headers and rate limit headers in response for client-side analytics
      const responseHeaders = new Headers();
      Object.entries(trackingHeaders).forEach(([key, value]) => {
        responseHeaders.set(key, value);
      });
      Object.entries(rateLimitHeaders).forEach(([key, value]) => {
        responseHeaders.set(key, value);
      });
      
      return NextResponse.json(errorData, { 
        status: response.status,
        headers: responseHeaders
      });
    }
    
    // Handle successful responses
    const contentType = response.headers.get('content-type');
    
    if (contentType?.includes('application/json') && method !== 'HEAD') {
      const data = await response.json();
      
      // Track resource creation for free trial mode
      if (isFreeTrialMode && method === 'POST' && response.ok) {
        const sessionId = request.headers.get(DEMO_API_HEADERS.SESSION_ID) || 
          request.cookies.get('demo_session_id')?.value;
        
        if (sessionId && data.data) {
          // Track project creation
          if (apiPath === '/projects' || apiPath === '/projects/') {
            trackResourceCreation(sessionId, 'project', data.data.id);
          }
          // Track conversation creation
          else if (apiPath === '/conversations' || apiPath === '/conversations/') {
            trackResourceCreation(sessionId, 'conversation', data.data.id);
          }
          // Track message creation
          else if (apiPath.match(/^\/conversations\/([^\/]+)\/message\/?$/)) {
            const conversationId = apiPath.match(/^\/conversations\/([^\/]+)\/message\/?$/)?.[1];
            if (conversationId && data.data.id) {
              trackResourceCreation(sessionId, 'message', data.data.id, conversationId);
            }
          }
        }
      }
      
      // Include tracking headers and rate limit headers in response for client-side analytics
      const responseHeaders = new Headers();
      Object.entries(trackingHeaders).forEach(([key, value]) => {
        responseHeaders.set(key, value);
      });
      Object.entries(rateLimitHeaders).forEach(([key, value]) => {
        responseHeaders.set(key, value);
      });
      
      return NextResponse.json(data, { headers: responseHeaders });
    } else {
      // For non-JSON responses (e.g., file downloads)
      const data = await response.arrayBuffer();
      
      // Include tracking headers and rate limit headers in response
      const responseHeaders = new Headers();
      responseHeaders.set('Content-Type', contentType || 'application/octet-stream');
      Object.entries(trackingHeaders).forEach(([key, value]) => {
        responseHeaders.set(key, value);
      });
      Object.entries(rateLimitHeaders).forEach(([key, value]) => {
        responseHeaders.set(key, value);
      });
      
      return new NextResponse(data, {
        headers: responseHeaders,
      });
    }
  } catch (error) {
    console.error(`[Proxy] Error for ${apiPath}:`, error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Extract path parameters and query string from URL
 */
export function extractPathAndQuery(
  request: NextRequest,
  basePath: string
): { path: string; query: string } {
  const url = new URL(request.url);
  const path = url.pathname.replace(basePath, '');
  const query = url.search;
  return { path, query };
}