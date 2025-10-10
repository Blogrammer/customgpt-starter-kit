import { NextRequest, NextResponse } from 'next/server';
import { 
  getAgentRateLimit,
  deleteAgentRateLimit,
  resetAgentCounters,
  getAgentUsageStats
} from '@/lib/agent-rate-limiter';

export async function GET(
  request: NextRequest,
  { params }: { params: { agentId: string } }
) {
  try {
    const agentId = params.agentId;
    const url = new URL(request.url);
    const includeStats = url.searchParams.get('includeStats') === 'true';

    const config = await getAgentRateLimit(agentId);
    
    let stats = null;
    if (includeStats) {
      stats = await getAgentUsageStats(agentId);
    }

    return NextResponse.json({
      success: true,
      data: {
        config,
        stats
      }
    });
  } catch (error) {
    console.error('[ADMIN_AGENTS] Error getting agent config:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get agent configuration' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { agentId: string } }
) {
  try {
    const agentId = params.agentId;
    await deleteAgentRateLimit(agentId);

    return NextResponse.json({
      success: true,
      message: `Rate limit configuration for agent ${agentId} deleted`
    });
  } catch (error) {
    console.error('[ADMIN_AGENTS] Error deleting agent config:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete agent configuration' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { agentId: string } }
) {
  try {
    const agentId = params.agentId;
    const body = await request.json();
    
    if (body.action === 'reset') {
      // Reset counters for this agent
      await resetAgentCounters(
        agentId,
        body.identity,
        body.window
      );

      return NextResponse.json({
        success: true,
        message: `Counters reset for agent ${agentId}`
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[ADMIN_AGENTS] Error processing action:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process action' },
      { status: 500 }
    );
  }
}
