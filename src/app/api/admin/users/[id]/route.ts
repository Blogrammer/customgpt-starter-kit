import { NextRequest, NextResponse } from 'next/server';
import { getUserDetails } from '@/lib/admin/analytics';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/');
    const identityKey = decodeURIComponent(pathSegments[pathSegments.length - 1]);
    
    if (!identityKey) {
      return NextResponse.json(
        { success: false, error: 'Identity key is required' },
        { status: 400 }
      );
    }
    
    const userDetails = await getUserDetails(identityKey);
    
    if (!userDetails) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: userDetails,
    });
    
  } catch (error) {
    console.error('[ADMIN_API] Error fetching user details:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch user details' },
      { status: 500 }
    );
  }
}
