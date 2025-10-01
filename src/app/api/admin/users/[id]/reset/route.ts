import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resetUserCounters } from '@/lib/admin/analytics';

const ResetSchema = z.object({
  window: z.enum(['minute', 'hour', 'day', 'all']).optional(),
  confirm: z.boolean(),
});

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/');
    const identityKey = decodeURIComponent(pathSegments[pathSegments.length - 2]);
    
    if (!identityKey) {
      return NextResponse.json(
        { success: false, error: 'Identity key is required' },
        { status: 400 }
      );
    }
    
    const body = await request.json();
    const parseResult = ResetSchema.safeParse(body);
    
    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }
    
    const { window, confirm } = parseResult.data;
    
    if (!confirm) {
      return NextResponse.json(
        { success: false, error: 'Confirmation required for destructive action' },
        { status: 400 }
      );
    }
    
    // Reset user counters
    const windowToReset = window === 'all' ? undefined : window;
    await resetUserCounters(identityKey, windowToReset);
    
    return NextResponse.json({
      success: true,
      message: `Reset ${window || 'all'} counters for ${identityKey}`,
      data: {
        identityKey,
        window: window || 'all',
        resetAt: new Date().toISOString(),
      },
    });
    
  } catch (error) {
    console.error('[ADMIN_API] Error resetting user counters:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to reset user counters' },
      { status: 500 }
    );
  }
}
