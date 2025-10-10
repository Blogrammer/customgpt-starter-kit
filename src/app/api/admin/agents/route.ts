import { NextRequest, NextResponse } from 'next/server';
import { 
  getAllAgentRateLimits,
  setAgentRateLimit,
  type AgentRateLimitConfig 
} from '@/lib/agent-rate-limiter';

/**
 * Get all agents from CustomGPT API with pagination and search
 */
async function fetchAgentsFromAPI(
  page: number = 1,
  search?: string
): Promise<{ agents: any[]; totalPages: number; totalCount: number }> {
  try {
    const apiKey = process.env.CUSTOMGPT_API_KEY;
    if (!apiKey) {
      throw new Error('CUSTOMGPT_API_KEY not configured');
    }

    const params = new URLSearchParams({
      page: page.toString(),
      // CustomGPT default page size is 10; explicit per_page not required
    });

    // The API supports filtering by name via `name` param per OpenAPI
    if (search) {
      params.append('name', search);
    }

    const response = await fetch(
      `https://app.customgpt.ai/api/v1/projects?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      console.error('Failed to fetch agents:', response.status);
      return { agents: [], totalPages: 0, totalCount: 0 };
    }

    const data = await response.json();

    // OpenAPI shows pagination fields under data.current_page, data.last_page, data.data[]
    const list = Array.isArray(data?.data?.data) ? data.data.data : Array.isArray(data?.data?.projects) ? data.data.projects : [];

    const agents = list.map((project: any) => ({
      id: (project.id ?? project.project_id)?.toString(),
      name: project.project_name || project.name || 'Unnamed Agent',
      sitemap: project.sitemap_path,
      createdAt: project.created_at,
      status: project.status || 'active'
    })).filter((p: any) => !!p.id);

    const totalPages = Number(data?.data?.last_page) || 0;
    const totalCount = Number(data?.data?.total ?? data?.total ?? agents.length);

    return {
      agents,
      totalPages,
      totalCount
    };
  } catch (error) {
    console.error('[ADMIN_AGENTS] Error fetching from API:', error);
    return { agents: [], totalPages: 0, totalCount: 0 };
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const search = url.searchParams.get('search') || undefined;
    const withConfig = url.searchParams.get('withConfig') === 'true';

    // Fetch agents from CustomGPT API
    const { agents, totalPages, totalCount } = await fetchAgentsFromAPI(page, search);

    // If requested, merge with rate limit configurations
    let agentConfigs: AgentRateLimitConfig[] = [];
    if (withConfig) {
      agentConfigs = await getAllAgentRateLimits();
    }

    // Merge agent data with configurations
    const mergedAgents = agents.map(agent => {
      const config = agentConfigs.find(c => c.agentId === agent.id);
      return {
        ...agent,
        rateLimitConfig: config || null
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        agents: mergedAgents,
        pagination: {
          page,
          totalPages,
          totalCount,
          hasMore: page < totalPages
        }
      }
    });
  } catch (error) {
    console.error('[ADMIN_AGENTS] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch agents' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.agentId) {
      return NextResponse.json(
        { success: false, error: 'Agent ID is required' },
        { status: 400 }
      );
    }

    // Create or update agent rate limit configuration
    const config: AgentRateLimitConfig = {
      agentId: body.agentId,
      agentName: body.agentName,
      limits: {
        queriesPerMinute: body.limits?.queriesPerMinute,
        queriesPerHour: body.limits?.queriesPerHour,
        queriesPerDay: body.limits?.queriesPerDay,
        queriesPerMonth: body.limits?.queriesPerMonth
      },
      enabled: body.enabled !== false,
      createdAt: body.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: body.createdBy
    };

    await setAgentRateLimit(config);

    return NextResponse.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('[ADMIN_AGENTS] Error setting rate limit:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to set agent rate limit' },
      { status: 500 }
    );
  }
}
