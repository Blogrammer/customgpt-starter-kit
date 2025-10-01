import { NextRequest, NextResponse } from 'next/server';
import { getIdentityKey, getIdentityConfig } from '@/lib/identity';

/**
 * Test endpoint for identity extraction
 * GET /api/test-identity - Returns the extracted identity key
 */
export async function GET(request: NextRequest) {
  try {
    const identityKey = await getIdentityKey(request);
    const config = getIdentityConfig();
    
    return NextResponse.json({
      key: identityKey,
      identityOrder: config.identityOrder,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[TestIdentity] Error:', error);
    return NextResponse.json(
      { error: 'Failed to extract identity' },
      { status: 500 }
    );
  }
}
