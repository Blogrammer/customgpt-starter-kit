/**
 * Proxy API Client
 * 
 * This client communicates with our Next.js API routes which proxy
 * requests to CustomGPT. The API key is stored securely on the server.
 */

import type {
  Agent,
  AgentStats,
  AgentSettings,
  Conversation,
  ChatMessage,
  Citation,
  APIResponse,
  AgentsResponse,
  ConversationsResponse,
  MessagesResponse,
  MessageResponse,
  CitationResponse,
  StreamChunk,
  LimitsResponse,
  UserProfile,
  CustomerIntelligenceResponse,
} from '@/types';
import type { APIMessageResponse } from '@/types/message.types';
import type { 
  PagesListResponse, 
  DeletePageResponse, 
  ReindexPageResponse, 
  PagesQueryParams,
  PageMetadata,
  PageMetadataResponse
} from '@/types/pages.types';
import type { 
  TrafficReportResponse, 
  QueriesReportResponse, 
  ConversationsReportResponse, 
  AnalysisReportResponse,
  AnalysisInterval
} from '@/types/reports.types';
import type { 
  SourcesListResponse, 
  SourceResponse, 
  DeleteSourceResponse,
  UpdateSourceSettingsRequest,
  CreateSitemapSourceRequest
} from '@/types/sources.types';
import { parseStreamChunk, retryWithBackoff } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { usageTracker } from '@/lib/analytics/usage-tracker';
import { getErrorMessage } from '@/lib/constants/error-messages';

interface UserProfileResponse {
  status: 'success' | 'error';
  data: UserProfile;
}

/**
 * ProxyCustomGPTClient
 * 
 * Client that communicates with our server-side proxy endpoints.
 * No API key is needed client-side as it's stored on the server.
 */
export class ProxyCustomGPTClient {
  private baseURL: string = '/api/proxy';
  private timeout: number = 30000;
  private abortControllers: Map<string, AbortController> = new Map();
  private isDemoMode: boolean = false;
  private demoApiKey: string | null = null;

  constructor() {
    // Demo mode is determined at runtime from localStorage
    if (typeof window !== 'undefined') {
      const deploymentMode = localStorage.getItem('customgpt.deploymentMode');
      this.isDemoMode = deploymentMode === 'demo';
      
      // Check if there's a global API URL configuration for widgets
      const globalApiUrl = (window as any).__customgpt_api_url;
      if (globalApiUrl) {
        this.baseURL = `${globalApiUrl}/api/proxy`;
      }
    }
    
    logger.info('PROXY_CLIENT', 'Proxy API Client initialized', {
      baseURL: this.baseURL,
      timeout: this.timeout,
      isDemoMode: this.isDemoMode,
    });
  }
  
  /**
   * Set the base API URL (for widget usage)
   */
  public setApiUrl(apiUrl: string) {
    this.baseURL = `${apiUrl}/api/proxy`;
    logger.info('PROXY_CLIENT', 'API URL updated', { baseURL: this.baseURL });
  }
  
  /**
   * Set demo mode API key
   */
  public setDemoApiKey(apiKey: string | null) {
    this.demoApiKey = apiKey;
  }

  /**
   * Make a request to the proxy API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const requestId = `${options.method || 'GET'}-${endpoint}-${Date.now()}`;
    
    logger.apiRequest(endpoint, options.method || 'GET', options.body);

    try {
      const controller = new AbortController();
      this.abortControllers.set(requestId, controller);

      const timeoutId = setTimeout(() => {
        controller.abort();
      }, this.timeout);

      // Don't set Content-Type for FormData - let browser set it with boundary
      const isFormData = options.body instanceof FormData;
      const baseHeaders: Record<string, string> = {
        ...(options.headers as Record<string, string> || {})
      };
      
      // Add deployment mode header
      const deploymentMode = typeof window !== 'undefined' 
        ? localStorage.getItem('customgpt.deploymentMode') || 'production'
        : 'production';
      baseHeaders['X-Deployment-Mode'] = deploymentMode;
      
      // Check if free trial mode
      const isFreeTrialMode = typeof window !== 'undefined' 
        ? localStorage.getItem('customgpt.freeTrialMode') === 'true'
        : false;
      
      if (isFreeTrialMode) {
        baseHeaders['X-Free-Trial-Mode'] = 'true';
        
        // Add session ID from session storage
        const sessionData = sessionStorage.getItem('customgpt.freeTrialSession');
        if (sessionData) {
          try {
            const session = JSON.parse(sessionData);
            if (session.sessionId) {
              baseHeaders['X-Demo-Session-ID'] = session.sessionId;
            }
          } catch (e) {
            console.error('[ProxyClient] Failed to parse session data:', e);
          }
        }
        
        console.log('[ProxyClient] Free trial mode - using server-side demo key');
      } else if (deploymentMode === 'demo' && this.demoApiKey) {
        // Add demo mode API key if available
        baseHeaders['X-CustomGPT-API-Key'] = this.demoApiKey;
        console.log('[ProxyClient] Added demo API key to request headers');
      } else if (deploymentMode === 'demo' && !this.demoApiKey) {
        console.warn('[ProxyClient] Demo mode but no API key available for request');
      }
      
      // Add Turnstile token if available for anonymous users
      if (typeof window !== 'undefined') {
        try {
          // Check for Turnstile token in localStorage or sessionStorage
          const turnstileToken = sessionStorage.getItem('customgpt.turnstileToken') || 
                               localStorage.getItem('customgpt.turnstileToken');
          if (turnstileToken) {
            const tokenData = JSON.parse(turnstileToken);
            // Check if token is still valid (not expired)
            if (tokenData.expiresAt && Date.now() < tokenData.expiresAt) {
              baseHeaders['X-Turnstile-Token'] = tokenData.token;
              baseHeaders['X-Turnstile-Action'] = 'api-request';
            }
          }
        } catch (e) {
          // Ignore token parsing errors
          console.warn('[ProxyClient] Failed to parse Turnstile token:', e);
        }
      }
      
      const headers: HeadersInit = isFormData 
        ? baseHeaders
        : { 
            'Content-Type': 'application/json',
            ...baseHeaders
          };
      
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      this.abortControllers.delete(requestId);

      // Check if response has content before trying to parse JSON
      let responseData;
      const contentLength = response.headers.get('content-length');
      const contentType = response.headers.get('content-type');
      
      if (contentLength === '0' || (!contentType?.includes('application/json') && response.status === 200)) {
        // Empty response or non-JSON success response
        responseData = { status: 'success', data: { updated: true } };
      } else {
        try {
          const text = await response.text();
          if (text.trim() === '') {
            // Empty response body
            responseData = { status: 'success', data: { updated: true } };
          } else {
            responseData = JSON.parse(text);
          }
        } catch (jsonError) {
          // Failed to parse JSON, but response was successful
          if (response.ok) {
            responseData = { status: 'success', data: { updated: true } };
          } else {
            throw new Error(`Failed to parse response: ${jsonError}`);
          }
        }
      }

      // Track API call
      usageTracker.trackApiCall(endpoint, options.method || 'GET', response.status);

      if (!response.ok) {
        // Track error
        usageTracker.trackError(`API Error: ${response.status}`, {
          endpoint,
          method: options.method || 'GET',
          error: responseData.error
        });
        
        // Get user-friendly error message for demo mode
        const isFreeTrialMode = baseHeaders['X-Free-Trial-Mode'] === 'true';
        const errorInfo = getErrorMessage(response.status, isFreeTrialMode);
        
        throw {
          message: responseData.error || errorInfo.message,
          status: response.status,
          data: responseData,
          title: errorInfo.title,
          isFreeTrialError: isFreeTrialMode && response.status === 429,
        };
      }

      logger.apiResponse(endpoint, response.status, responseData);
      return responseData;
    } catch (error: any) {
      this.abortControllers.delete(requestId);
      
      if (error.name === 'AbortError') {
        logger.apiError(endpoint, { message: 'Request timeout', code: 'TIMEOUT' });
        throw new Error('Request timeout');
      }

      logger.apiError(endpoint, error);
      throw error;
    }
  }

  /**
   * Make a streaming request to the proxy API
   */
  private async streamRequest(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ReadableStream<Uint8Array>> {
    const url = `${this.baseURL}${endpoint}`;
    
    logger.apiRequest(endpoint, 'POST-STREAM', options.body);

    // Build headers with demo mode support
    const baseHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      ...(options.headers as Record<string, string> || {})
    };
    
    // Add deployment mode header
    const deploymentMode = typeof window !== 'undefined' 
      ? localStorage.getItem('customgpt.deploymentMode') || 'production'
      : 'production';
    baseHeaders['X-Deployment-Mode'] = deploymentMode;
    
    // Check if free trial mode
    const isFreeTrialMode = typeof window !== 'undefined' 
      ? localStorage.getItem('customgpt.freeTrialMode') === 'true'
      : false;
    
    if (isFreeTrialMode) {
      baseHeaders['X-Free-Trial-Mode'] = 'true';
      
      // Add session ID from session storage
      const sessionData = sessionStorage.getItem('customgpt.freeTrialSession');
      if (sessionData) {
        try {
          const session = JSON.parse(sessionData);
          if (session.sessionId) {
            baseHeaders['X-Demo-Session-ID'] = session.sessionId;
          }
        } catch (e) {
          console.error('[ProxyClient] Failed to parse session data:', e);
        }
      }
      
      console.log('[ProxyClient] Free trial mode - using server-side demo key for streaming');
    } else if (deploymentMode === 'demo' && this.demoApiKey) {
      // Add demo mode API key if available
      baseHeaders['X-CustomGPT-API-Key'] = this.demoApiKey;
      console.log('[ProxyClient] Added demo API key to streaming request headers');
    } else if (deploymentMode === 'demo' && !this.demoApiKey) {
      console.warn('[ProxyClient] Demo mode but no API key available for streaming request');
    }

    const response = await fetch(url, {
      ...options,
      headers: baseHeaders,
    });

    if (!response.ok) {
      let errorMessage = `Stream request failed: ${response.status}`;
      try {
        const errorText = await response.text();
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch {
        // If not JSON, use the status message
      }
      logger.apiError(endpoint, { message: errorMessage, status: response.status });
      throw new Error(errorMessage);
    }

    logger.apiResponse(endpoint, response.status, 'Stream started');

    return response.body!;
  }

  /**
   * Cancel a specific request
   */
  cancelRequest(endpoint: string, method: string = 'GET'): void {
    const controllers = Array.from(this.abortControllers.entries());
    controllers.forEach(([key, controller]) => {
      if (key.includes(`${method}-${endpoint}`)) {
        controller.abort();
        this.abortControllers.delete(key);
      }
    });
  }

  /**
   * Cancel all pending requests
   */
  cancelAllRequests(): void {
    this.abortControllers.forEach(controller => controller.abort());
    this.abortControllers.clear();
  }

  // Agent Management
  async getAgents(params?: {
    page?: number;
    per_page?: number;
  }): Promise<AgentsResponse> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.per_page) queryParams.append('per_page', params.per_page.toString());
    
    const queryString = queryParams.toString();
    return this.request(`/projects${queryString ? `?${queryString}` : ''}`);
  }

  async createAgent(data: {
    project_name: string;
    sitemap_path?: string;
    file_upload?: boolean;
    webpage_url?: string;
  }): Promise<APIResponse<Agent>> {
    return this.request('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getAgent(id: number): Promise<APIResponse<Agent>> {
    return this.request(`/projects/${id}`);
  }

  async updateAgent(id: number, data: { project_name?: string; are_licenses_allowed?: boolean; is_shared?: boolean; sitemap_path?: string }): Promise<APIResponse<Agent>> {
    console.log('[ProxyClient] updateAgent called with:', { id, data });
    
    // Use FormData for multipart/form-data as specified in OpenAPI
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        formData.append(key, String(value));
        console.log('[ProxyClient] FormData append:', key, value);
      }
    });

    const response = await this.request<APIResponse<Agent>>(`/projects/${id}`, {
      method: 'POST', // Changed from PUT to POST as per OpenAPI spec
      body: formData,
    });
    
    console.log('[ProxyClient] updateAgent response:', response);
    return response;
  }

  async deleteAgent(id: number): Promise<APIResponse<{ deleted: boolean }>> {
    return this.request(`/projects/${id}`, {
      method: 'DELETE',
    });
  }

  async replicateAgent(id: number): Promise<APIResponse<Agent>> {
    return this.request(`/projects/${id}/replicate`, {
      method: 'POST',
    });
  }

  async getAgentStats(id: number): Promise<APIResponse<AgentStats>> {
    return this.request(`/projects/${id}/stats`);
  }

  async getAgentSettings(id: number): Promise<APIResponse<AgentSettings>> {
    return this.request(`/projects/${id}/settings`);
  }

  async updateAgentSettings(id: number, settings: Partial<AgentSettings> | FormData): Promise<APIResponse<AgentSettings>> {
    const isFormData = settings instanceof FormData;
    return this.request(`/projects/${id}/settings`, {
      method: 'POST',
      body: isFormData ? settings : JSON.stringify(settings),
      headers: isFormData ? {} : { 'Content-Type': 'application/json' },
    });
  }

  // Plugin Management
  async getProjectPlugins(projectId: number): Promise<APIResponse<any[]>> {
    return this.request(`/projects/${projectId}/plugins`);
  }

  async updateProjectPlugin(
    projectId: number,
    pluginId: string,
    data: { enabled: boolean }
  ): Promise<APIResponse<{ updated: boolean }>> {
    return this.request(`/projects/${projectId}/plugins/${pluginId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Conversation Management
  async getConversations(projectId: number, params?: {
    page?: number;
    per_page?: number;
    order?: 'asc' | 'desc';
    orderBy?: string;
    userFilter?: 'all' | 'me' | string;
  }): Promise<ConversationsResponse> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.per_page) queryParams.append('per_page', params.per_page.toString());
    if (params?.order) queryParams.append('order', params.order);
    if (params?.orderBy) queryParams.append('orderBy', params.orderBy);
    if (params?.userFilter) queryParams.append('userFilter', params.userFilter);
    
    const queryString = queryParams.toString();
    return this.request(`/projects/${projectId}/conversations${queryString ? `?${queryString}` : ''}`);
  }

  async createConversation(projectId: number, data?: { name?: string }): Promise<APIResponse<Conversation>> {
    return this.request(`/projects/${projectId}/conversations`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  }

  async updateConversation(
    projectId: number,
    sessionId: string,
    data: { name?: string }
  ): Promise<APIResponse<Conversation>> {
    return this.request(`/projects/${projectId}/conversations/${sessionId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteConversation(projectId: number, sessionId: string): Promise<APIResponse<{ deleted: boolean }>> {
    return this.request(`/projects/${projectId}/conversations/${sessionId}`, {
      method: 'DELETE',
    });
  }

  // Message Management
  async getMessages(
    projectId: number,
    sessionId: string,
    params?: {
      page?: number;
      per_page?: number;
    }
  ): Promise<MessagesResponse> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.per_page) queryParams.append('per_page', params.per_page.toString());
    
    const queryString = queryParams.toString();
    return this.request(`/projects/${projectId}/conversations/${sessionId}/messages${queryString ? `?${queryString}` : ''}`);
  }

  async sendMessage(
    projectId: number,
    sessionId: string,
    data: {
      prompt: string;
      stream?: boolean;
      source_ids?: string[];
      response_source?: string;
      chatbot_model?: string;
      custom_persona?: string;
      agent_capability?: string;
    }
  ): Promise<MessageResponse> {
    return this.request(`/projects/${projectId}/conversations/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }


  async sendMessageStream(
    projectId: number,
    sessionId: string,
    data: {
      prompt: string;
      source_ids?: string[];
      response_source?: string;
      chatbot_model?: string;
      custom_persona?: string;
      agent_capability?: string;
    },
    onChunk: (chunk: StreamChunk) => void,
    onError?: (error: Error) => void,
    onComplete?: () => void
  ): Promise<void> {
    try {
      // Try the standard messages endpoint with stream=true parameter
      const stream = await this.streamRequest(
        `/projects/${projectId}/conversations/${sessionId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({ ...data, stream: true }),
        }
      );

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          onComplete?.();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = line.slice(6);
              if (data === '[DONE]') {
                onComplete?.();
                return;
              }
              // parseStreamChunk expects the full line with "data: " prefix
              const chunk = parseStreamChunk(line);
              if (chunk) {
                onChunk(chunk);
              }
            } catch (e) {
              console.error('Failed to parse chunk:', e);
            }
          }
        }
      }
    } catch (error: any) {
      onError?.(error);
      throw error;
    }
  }

  async getMessageById(
    projectId: number,
    sessionId: string,
    messageId: number
  ): Promise<APIMessageResponse> {
    return this.request(`/projects/${projectId}/conversations/${sessionId}/messages/${messageId}`);
  }

  async updateMessageFeedback(
    projectId: number,
    sessionId: string,
    messageId: number,
    feedback: { feedback: 'thumbs_up' | 'thumbs_down' }
  ): Promise<MessageResponse> {
    return this.request(`/projects/${projectId}/conversations/${sessionId}/messages/${messageId}/feedback`, {
      method: 'PUT',
      body: JSON.stringify(feedback),
    });
  }

  // Citations
  async getCitation(projectId: number, citationId: number): Promise<CitationResponse> {
    return this.request(`/projects/${projectId}/citations/${citationId}`);
  }

  async previewCitationFile(id: string): Promise<any> {
    return this.request(`/preview/${id}`);
  }

  // File Upload
  async uploadFile(projectId: number, file: File, options?: {
    onProgress?: (progress: number) => void;
  }): Promise<SourceResponse> {
    const formData = new FormData();
    formData.append('file', file);
    
    // Use the correct /sources endpoint for file uploads
    return this.request(`/projects/${projectId}/sources`, {
      method: 'POST',
      body: formData,
      headers: {}, // Let browser set content-type with boundary
    });
  }

  // Reports
  async getTrafficReport(projectId: number): Promise<TrafficReportResponse> {
    return this.request(`/projects/${projectId}/reports/traffic`);
  }

  async getQueriesReport(projectId: number): Promise<QueriesReportResponse> {
    return this.request(`/projects/${projectId}/reports/queries`);
  }

  async getConversationsReport(projectId: number): Promise<ConversationsReportResponse> {
    return this.request(`/projects/${projectId}/reports/conversations`);
  }

  async getAnalysisReport(projectId: number, interval?: AnalysisInterval): Promise<AnalysisReportResponse> {
    const queryParams = new URLSearchParams();
    if (interval) queryParams.append('interval', interval);
    
    const queryString = queryParams.toString();
    return this.request(`/projects/${projectId}/reports/analysis${queryString ? `?${queryString}` : ''}`);
  }

  // Pages
  async getPages(
    projectId: number,
    params?: PagesQueryParams
  ): Promise<PagesListResponse> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.order) queryParams.append('order', params.order);
    if (params?.crawl_status) queryParams.append('crawl_status', params.crawl_status);
    if (params?.index_status) queryParams.append('index_status', params.index_status);
    
    const queryString = queryParams.toString();
    return this.request(`/projects/${projectId}/pages${queryString ? `?${queryString}` : ''}`);
  }

  async deletePage(projectId: number, pageId: number): Promise<DeletePageResponse> {
    return this.request(`/projects/${projectId}/pages/${pageId}`, {
      method: 'DELETE',
    });
  }

  async reindexPage(projectId: number, pageId: number): Promise<ReindexPageResponse> {
    return this.request(`/projects/${projectId}/pages/${pageId}/reindex`, {
      method: 'POST',
    });
  }

  async getPageMetadata(projectId: number, pageId: number): Promise<PageMetadataResponse> {
    return this.request(`/projects/${projectId}/pages/${pageId}/metadata`);
  }

  async updatePageMetadata(
    projectId: number,
    pageId: number,
    metadata: Partial<PageMetadata>
  ): Promise<PageMetadataResponse> {
    return this.request(`/projects/${projectId}/pages/${pageId}/metadata`, {
      method: 'PUT',
      body: JSON.stringify(metadata),
    });
  }

  // NOTE: This endpoint is not documented in the API
  // Commenting out until we confirm it exists
  // async previewFile(pageId: number): Promise<any> {
  //   return this.request(`/page_file/${pageId}`);
  // }

  // Licenses
  async getLicenses(projectId: number): Promise<APIResponse<any[]>> {
    return this.request(`/projects/${projectId}/license_keys`);
  }

  async createLicense(projectId: number, data: { name: string }): Promise<APIResponse<any>> {
    return this.request(`/projects/${projectId}/license_keys`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getLicense(projectId: number, licenseId: string): Promise<APIResponse<any>> {
    return this.request(`/projects/${projectId}/license_keys/${licenseId}`);
  }

  async updateLicense(
    projectId: number,
    licenseId: string,
    data: { name?: string; is_active?: boolean }
  ): Promise<APIResponse<any>> {
    return this.request(`/projects/${projectId}/license_keys/${licenseId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteLicense(projectId: number, licenseId: string): Promise<APIResponse<any>> {
    return this.request(`/projects/${projectId}/license_keys/${licenseId}`, {
      method: 'DELETE',
    });
  }

  // Sources
  async getSources(projectId: number): Promise<SourcesListResponse> {
    return this.request(`/projects/${projectId}/sources`);
  }

  async createSitemapSource(
    projectId: number,
    data: CreateSitemapSourceRequest
  ): Promise<SourceResponse> {
    // Convert JSON data to FormData as the API expects multipart/form-data
    const formData = new FormData();
    formData.append('sitemap_path', data.sitemap_path);
    if (data.executive_js !== undefined) {
      formData.append('executive_js', String(data.executive_js));
    }
    if (data.data_refresh_frequency !== undefined) {
      formData.append('data_refresh_frequency', data.data_refresh_frequency);
    }
    if (data.create_new_pages !== undefined) {
      formData.append('create_new_pages', String(data.create_new_pages));
    }
    if (data.remove_unexist_pages !== undefined) {
      formData.append('remove_unexist_pages', String(data.remove_unexist_pages));
    }
    if (data.refresh_existing_pages !== undefined) {
      formData.append('refresh_existing_pages', data.refresh_existing_pages);
    }

    return this.request(`/projects/${projectId}/sources`, {
      method: 'POST',
      body: formData,
      headers: {}, // Let browser set content-type with boundary
    });
  }

  async uploadFileSource(projectId: number, formData: FormData): Promise<SourceResponse> {
    return this.request(`/projects/${projectId}/sources`, {
      method: 'POST',
      body: formData,
      headers: {}, // Let browser set content-type with boundary
    });
  }

  /**
   * Update source settings
   * Updates the settings for an existing source.
   * API endpoint: PUT /projects/{projectId}/sources/{sourceId}
   */
  async updateSourceSettings(
    projectId: number,
    sourceId: number,
    settings: UpdateSourceSettingsRequest
  ): Promise<SourceResponse> {
    return this.request(`/projects/${projectId}/sources/${sourceId}`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  async deleteSource(projectId: number, sourceId: number): Promise<DeleteSourceResponse> {
    return this.request(`/projects/${projectId}/sources/${sourceId}`, {
      method: 'DELETE',
    });
  }

  async instantSyncSource(projectId: number, sourceId: number): Promise<SourceResponse> {
    return this.request(`/projects/${projectId}/sources/${sourceId}/instant-sync`, {
      method: 'PUT',
    });
  }

  // Customer Intelligence
  async getCustomerIntelligence(
    projectId: number,
    page: number = 1,
    limit: number = 100,
    startDate?: string,
    endDate?: string
  ): Promise<CustomerIntelligenceResponse> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString()
    });
    
    if (startDate) {
      params.append('start_date', startDate);
    }
    
    if (endDate) {
      params.append('end_date', endDate);
    }
    
    return this.request(`/projects/${projectId}/reports/intelligence?${params.toString()}`);
  }

  // User
  async getUserLimits(): Promise<LimitsResponse> {
    return this.request('/user/limits');
  }

  async getUserProfile(): Promise<UserProfileResponse> {
    return this.request('/user');
  }

  async updateUserProfile(formData: FormData): Promise<UserProfileResponse> {
    return this.request('/user', {
      method: 'POST',
      body: formData,
      headers: {}, // Let browser set content-type with boundary
    });
  }

  // Demo Mode
  async getDemoUsageStats(): Promise<{
    status: string;
    data: {
      usage: {
        projects: { used: number; limit: number; remaining: number };
        conversations: { used: number; limit: number; remaining: number };
        messages: { total: number; limitPerConversation: number; byConversation: Record<string, number> };
      };
      session: {
        sessionId: string;
        startTime: number;
        expiresAt: number;
        remainingTime: number;
      };
    };
  }> {
    // Add session start time header
    const sessionData = sessionStorage.getItem('customgpt.freeTrialSession');
    let startTime = Date.now();
    
    if (sessionData) {
      try {
        const session = JSON.parse(sessionData);
        startTime = session.startTime || Date.now();
      } catch (e) {
        console.error('[ProxyClient] Failed to parse session data:', e);
      }
    }
    
    return this.request('/demo/usage', {
      headers: {
        'X-Session-Start-Time': startTime.toString()
      }
    });
  }
  
  async cleanupDemoSession(): Promise<{
    status: string;
    data: {
      sessionId: string;
      totalResources: number;
      successCount: number;
      failureCount: number;
      results: Array<{
        success: boolean;
        resourceId: string;
        resourceType: string;
        error?: string;
      }>;
    };
  }> {
    return this.request('/demo/cleanup', {
      method: 'POST'
    });
  }
}

// Export singleton instance
export const proxyClient = new ProxyCustomGPTClient();