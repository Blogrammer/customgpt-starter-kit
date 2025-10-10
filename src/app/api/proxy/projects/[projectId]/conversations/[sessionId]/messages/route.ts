import { NextRequest, NextResponse } from 'next/server';
import { proxyRequest } from '@/lib/api/proxy-handler';
import { applyAgentRateLimit, checkIPBlock } from '@/lib/agent-rate-limiter';
import { getIdentityKey } from '@/lib/identity';

interface Params {
  params: { 
    projectId: string;
    sessionId: string;
  };
}

// GET /api/proxy/projects/[projectId]/conversations/[sessionId]/messages - Get messages
export async function GET(request: NextRequest, { params }: Params) {
  const url = new URL(request.url);
  const query = url.search;
  return proxyRequest(
    `/projects/${params.projectId}/conversations/${params.sessionId}/messages${query}`, 
    request,
    { method: 'GET' }
  );
}

// POST /api/proxy/projects/[projectId]/conversations/[sessionId]/messages - Send message
export async function POST(request: NextRequest, { params }: Params) {
  try {
    // Extract IP from identity
    const identity = await getIdentityKey(request);
    const ip = identity.split(':')[1];
    
    // Check IP block first
    const ipBlock = await checkIPBlock(ip);
    if (ipBlock.blocked) {
      return NextResponse.json(
        { 
          error: 'Access denied', 
          message: ipBlock.reason || 'Your IP has been blocked' 
        },
        { status: 403 }
      );
    }
    
    // Apply agent-specific rate limiting for message sending (this counts as a query)
    const rateLimitResult = await applyAgentRateLimit(request, params.projectId);
    
    if (!rateLimitResult.allowed) {
      const retryAfter = rateLimitResult.resetTime - Math.floor(Date.now() / 1000);
      
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: `Too many queries for this agent. Try again in ${retryAfter} seconds.`,
          details: {
            agentId: params.projectId,
            window: rateLimitResult.window,
            limit: rateLimitResult.limit,
            remaining: rateLimitResult.remaining,
            resetTime: rateLimitResult.resetTime,
            retryAfter
          }
        },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': rateLimitResult.limit.toString(),
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
            'Retry-After': retryAfter.toString()
          }
        }
      );
    }
  } catch (error) {
    console.error('[Agent Rate Limit] Error:', error);
    // On error, fail open and proceed with request
  }
  
  const url = new URL(request.url);
  const query = url.search;
  
  // Check if this is a streaming request from request body
  let isStream = false;
  let body: any;
  
  try {
    // Clone the request to avoid consuming the original body
    const clonedRequest = request.clone();
    body = await clonedRequest.json();
    isStream = body.stream === true;
  } catch (error) {
    console.error('[Proxy] Failed to parse request body:', error);
    // If parsing fails, assume non-streaming
    isStream = false;
  }
  
  return proxyRequest(
    `/projects/${params.projectId}/conversations/${params.sessionId}/messages${query}`,
    request,
    { 
      isStream,
      body: body, // Pass the parsed body to avoid re-parsing in proxy handler
      method: 'POST'
    }
  );
}