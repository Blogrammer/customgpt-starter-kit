import { NextRequest, NextResponse } from 'next/server';
import { getAnalytics } from '@/lib/admin/analytics';

export async function GET(request: NextRequest) {
  try {
    const analytics = await getAnalytics();
    
    return NextResponse.json({
      success: true,
      data: analytics,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('[ADMIN_API] Error fetching analytics:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch analytics data' },
      { status: 500 }
    );
  }
}
