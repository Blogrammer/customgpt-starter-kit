import { NextRequest, NextResponse } from 'next/server';
import { 
  getAllBlockedIPs,
  setIPBlock,
  removeIPBlock,
  type IPBlockConfig 
} from '@/lib/agent-rate-limiter';

export async function GET(request: NextRequest) {
  try {
    const blockedIPs = await getAllBlockedIPs();
    
    // Sort by creation date, newest first
    blockedIPs.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });

    return NextResponse.json({
      success: true,
      data: blockedIPs
    });
  } catch (error) {
    console.error('[IP_MANAGEMENT] Error fetching blocked IPs:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch IP configurations' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.ip) {
      return NextResponse.json(
        { success: false, error: 'IP address is required' },
        { status: 400 }
      );
    }

    if (!['block', 'custom_limit'].includes(body.type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid type. Must be "block" or "custom_limit"' },
        { status: 400 }
      );
    }

    // Validate IP format (basic check)
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipRegex.test(body.ip)) {
      return NextResponse.json(
        { success: false, error: 'Invalid IP address format' },
        { status: 400 }
      );
    }

    // Create IP configuration
    const config: IPBlockConfig = {
      ip: body.ip,
      type: body.type,
      customLimits: body.customLimits,
      reason: body.reason,
      expiresAt: body.expiresAt,
      createdAt: new Date().toISOString(),
      createdBy: body.createdBy
    };

    await setIPBlock(config);

    return NextResponse.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('[IP_MANAGEMENT] Error setting IP configuration:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to set IP configuration' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const ip = url.searchParams.get('ip');

    if (!ip) {
      return NextResponse.json(
        { success: false, error: 'IP address is required' },
        { status: 400 }
      );
    }

    await removeIPBlock(ip);

    return NextResponse.json({
      success: true,
      message: `IP configuration for ${ip} removed`
    });
  } catch (error) {
    console.error('[IP_MANAGEMENT] Error removing IP configuration:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to remove IP configuration' },
      { status: 500 }
    );
  }
}
