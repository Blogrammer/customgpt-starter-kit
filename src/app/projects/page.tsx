/**
 * Projects Management Page
 * 
 * Comprehensive project/agent configuration interface for CustomGPT.
 * Provides centralized access to all project settings and management.
 * 
 * Features:
 * - Project list with search
 * - Multi-tab settings interface
 * - Real-time updates
 * - Responsive layout design
 * - Project selection persistence
 * - Loading states
 * - Empty states
 * - Settings categorization
 * 
 * Settings Categories:
 * - General: Basic info, prompts, instructions
 * - Appearance: Branding, colors, UI customization
 * - Behavior: AI model, personality, response settings
 * - Data Sources: File uploads, website crawling
 * - Content Pages: Indexed content management
 * - Conversations: Chat history and sharing
 * - Analytics: Traffic and usage reports
 * - Security: Access control, anti-hallucination
 * 
 * Layout Structure:
 * - Left sidebar: Project list
 * - Center panel: Settings tabs
 * - Right content: Active settings panel
 * - Three-column responsive design
 * 
 * State Management:
 * - Uses agentStore for project data
 * - Local state for selection/tabs
 * - Automatic first project selection
 * 
 * Features:
 * - Comprehensive project management with intuitive settings organization
 * - Advanced project operations including creation and bulk management
 * - Professional search and filtering capabilities
 * - Project template system with export/import functionality
 * - Full project lifecycle management with cloning and comparison tools
 */

'use client';

import React, { useEffect, useState, Suspense, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { TurnstileGate } from '@/components/chat/TurnstileGate';
import { 
  Bot, 
  Settings, 
  Search, 
  Plus, 
  ChevronRight,
  Palette,
  MessageCircle,
  Brain,
  BarChart3,
  Info,
  RefreshCw,
  Database,
  FileText,
  Users,
  Shield,
  Activity,
  Zap,
  GripVertical
} from 'lucide-react';
import { toast } from 'sonner';

import { useAgentStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageLayout } from '@/components/layout/PageLayout';
import { PageLoading, ScreenLoading } from '@/components/ui/loading';
import { AgentAvatar } from '@/components/ui/avatar';
import { MobileProjectsPage } from '@/components/mobile/MobileProjectsPage';
import { useBreakpoint } from '@/hooks/useMediaQuery';
import { cn, formatTimestamp } from '@/lib/utils';
import type { Agent } from '@/types';

// Project settings components - modular settings panels
import { GeneralSettings } from '@/components/projects/GeneralSettings';
import { AppearanceSettings } from '@/components/projects/AppearanceSettings';
import { BehaviorSettings } from '@/components/projects/BehaviorSettings';
import { SourcesSettings } from '@/components/projects/SourcesSettings';
import { PagesSettings } from '@/components/projects/PagesSettings';
import { ConversationsSettings } from '@/components/projects/ConversationsSettings';
import { ReportsAnalytics } from '@/components/projects/ReportsAnalytics';
import { CustomerIntelligenceTab } from '@/components/projects/CustomerIntelligenceTab';
import { AdvancedSettings } from '@/components/projects/AdvancedSettings';
// Consolidated components
import { MessagesAndCitations } from '@/components/projects/MessagesAndCitations';
import { BusinessAndLicensing } from '@/components/projects/BusinessAndLicensing';
import { SecurityAndPrivacy } from '@/components/projects/SecurityAndPrivacy';

/**
 * Settings tab type definition
 * Represents available configuration sections
 */
type SettingsTab = 'general' | 'appearance' | 'behavior' | 'sources' | 'pages' | 'conversations' | 'analytics' | 'intelligence' | 'messages-citations' | 'advanced' | 'business-licensing' | 'security';

/**
 * Settings tabs configuration
 * Defines all available project settings categories with metadata
 */
const settingsTabs = [
  { id: 'general' as SettingsTab, label: 'General', icon: Info, description: 'Basic project settings and prompts' },
  { id: 'appearance' as SettingsTab, label: 'Appearance', icon: Palette, description: 'Branding, colors, and UI customization' },
  { id: 'behavior' as SettingsTab, label: 'Behavior', icon: Brain, description: 'AI personality, model, and response settings' },
  { id: 'sources' as SettingsTab, label: 'Data Sources', icon: Database, description: 'Upload files, add websites, manage data' },
  { id: 'pages' as SettingsTab, label: 'Content Pages', icon: FileText, description: 'Manage indexed content and metadata' },
  { id: 'conversations' as SettingsTab, label: 'Conversations', icon: Users, description: 'Chat history, sharing, and management' },
  { id: 'analytics' as SettingsTab, label: 'Reports & Analytics', icon: BarChart3, description: 'Traffic, queries, and conversation reports' },
  { id: 'intelligence' as SettingsTab, label: 'Customer Intelligence', icon: Activity, description: 'Customer interactions, emotions, intents, and behavioral analytics' },
  { id: 'messages-citations' as SettingsTab, label: 'Messages & Citations', icon: MessageCircle, description: 'Custom messages, templates, and citation display settings' },
  { id: 'advanced' as SettingsTab, label: 'Advanced', icon: Settings, description: 'Advanced configuration settings' },
  { id: 'business-licensing' as SettingsTab, label: 'Business & Licensing', icon: Zap, description: 'Commerce settings, monetization, and license management' },
  { id: 'security' as SettingsTab, label: 'Security & Privacy', icon: Shield, description: 'Access control, data retention, and security settings' },
];

/**
 * ProjectCard component props
 */
interface ProjectCardProps {
  project: Agent;
  isSelected: boolean;
  onClick: () => void;
}

/**
 * ProjectCard Component
 * 
 * Displays individual project in the sidebar list.
 * Shows project name, ID, status, and last update time.
 * 
 * @param project - Agent/project data
 * @param isSelected - Whether this project is currently selected
 * @param onClick - Selection handler
 */
const ProjectCard: React.FC<ProjectCardProps> = ({ project, isSelected, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full p-4 text-left border rounded-lg transition-all hover:shadow-sm',
        isSelected 
          ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 shadow-sm' 
          : 'border-border hover:border-border/80'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Project Avatar */}
        <AgentAvatar 
          agent={project}
          size="lg"
          isSelected={isSelected}
          className="flex-shrink-0"
        />
        
        {/* Project details */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base text-foreground mb-1 break-words">
            {project.project_name}
          </h3>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground font-medium">
              ID: {project.id}
            </p>
            <p className="text-sm text-muted-foreground">
              Status: <span className={cn(
                'font-medium',
                project.is_chat_active ? 'text-green-600' : 'text-muted-foreground'
              )}>
                {project.is_chat_active ? 'Active' : 'Inactive'}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              Updated {formatTimestamp(project.updated_at)}
            </p>
          </div>
        </div>
        
        {/* Selection indicator */}
        {isSelected && (
          <ChevronRight className="w-5 h-5 text-brand-500 flex-shrink-0 mt-1" />
        )}
      </div>
    </button>
  );
};

/**
 * SettingsTabButton component props
 */
interface SettingsTabProps {
  tab: typeof settingsTabs[0];
  isActive: boolean;
  onClick: () => void;
}

/**
 * SettingsTabButton Component
 * 
 * Individual settings category button in the center panel.
 * Shows icon, label, and description for each settings section.
 * 
 * @param tab - Tab configuration object
 * @param isActive - Whether this tab is currently active
 * @param onClick - Tab selection handler
 */
const SettingsTabButton: React.FC<SettingsTabProps> = ({ tab, isActive, onClick }) => {
  const Icon = tab.icon;
  
  return (
    <button
      onClick={onClick}
      data-tab={tab.id}
      className={cn(
        'w-full p-3 text-left border-b border-border transition-colors hover:bg-accent',
        isActive && 'bg-brand-50 dark:bg-brand-900/20 border-r-2 border-r-brand-500 dark:border-r-brand-400'
      )}
    >
      <div className="flex items-center gap-3">
        <Icon className={cn(
          'w-4 h-4', 
          isActive ? 'text-brand-600 dark:text-brand-400' : 'text-muted-foreground'
        )} />
        <div>
          <h4 className={cn(
            'text-sm font-medium',
            isActive ? 'text-brand-900 dark:text-brand-100' : 'text-foreground'
          )}>
            {tab.label}
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            {tab.description}
          </p>
        </div>
      </div>
    </button>
  );
};

/**
 * Projects Page Content Component
 * 
 * The main content component that uses useSearchParams.
 * This is separated to be wrapped in Suspense.
 */
function ProjectsPageContent() {
  // Hooks
  const { isMobile } = useBreakpoint();
  const router = useRouter();
  
  // Store hooks and local state
  const { agents, loading, fetchAgents, loadMoreAgents, paginationMeta } = useAgentStore();
  const [selectedProject, setSelectedProject] = useState<Agent | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingAllForSearch, setIsLoadingAllForSearch] = useState(false);
  
  // Resizable sidebar state
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    // Load saved width from localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('projects-sidebar-width');
      return saved ? parseInt(saved, 10) : 320;
    }
    return 320; // Default 320px (20rem)
  });
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const MIN_WIDTH = 256; // 16rem
  const MAX_WIDTH = 480; // 30rem
  
  // Save sidebar width to localStorage
  useEffect(() => {
    localStorage.setItem('projects-sidebar-width', sidebarWidth.toString());
  }, [sidebarWidth]);
  
  // Get query parameters to check for project ID and tab
  const searchParams = useSearchParams();
  const projectIdFromUrl = searchParams.get('id');
  const tabFromUrl = searchParams.get('tab') as SettingsTab;

  /**
   * Load projects on mount
   * Fetches all available agents/projects from the API
   */
  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  /**
   * Auto-select project based on URL parameter or first project
   * 1. First, try to select project from URL parameter
   * 2. Otherwise, select the first project in the list
   */
  useEffect(() => {
    if (agents.length > 0) {
      // If URL has project ID, find and select that project
      if (projectIdFromUrl) {
        const projectFromUrl = agents.find(p => p.id.toString() === projectIdFromUrl);
        if (projectFromUrl) {
          setSelectedProject(projectFromUrl);
          return;
        }
      }
      
      // Otherwise, select first project if none selected
      if (!selectedProject) {
        setSelectedProject(agents[0]);
      }
    }
  }, [agents, projectIdFromUrl, selectedProject]); // Remove selectedProject from dependencies to avoid infinite loop

  /**
   * Set active tab based on URL parameter
   * This allows direct navigation to specific settings tabs
   */
  useEffect(() => {
    if (tabFromUrl && settingsTabs.find(tab => tab.id === tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl]);

  /**
   * Automatically load all pages when searching
   * This ensures search works across all projects, not just loaded ones
   */
  useEffect(() => {
    const loadAllAgentsForSearch = async () => {
      // Only trigger if we have a search query and there are more pages to load
      if (!searchQuery || !paginationMeta?.hasMore || loading || isLoadingAllForSearch) {
        return;
      }

      console.log('🔍 [Projects] Starting to load all agents for search...');
      setIsLoadingAllForSearch(true);
      
      try {
        // Keep loading pages until we have all agents
        let attempts = 0;
        const maxAttempts = 20; // Safety limit to prevent infinite loops
        
        while (attempts < maxAttempts) {
          // Get fresh pagination state
          const currentState = useAgentStore.getState();
          if (!currentState.paginationMeta?.hasMore) {
            break;
          }
          
          attempts++;
          console.log(`📥 [Projects] Loading more agents... (attempt ${attempts})`);
          
          await loadMoreAgents();
          
          // Small delay to avoid overwhelming the API
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        const finalState = useAgentStore.getState();
        console.log('✅ [Projects] Finished loading all agents for search');
        toast.success(`Loaded all ${finalState.agents.length} projects for search`);
      } catch (error) {
        console.error('Failed to load all agents for search:', error);
        toast.error('Failed to load all projects for search');
      } finally {
        setIsLoadingAllForSearch(false);
      }
    };

    // Only run if we have a search query
    if (searchQuery) {
      loadAllAgentsForSearch();
    }
  }, [searchQuery, paginationMeta?.hasMore, loading, loadMoreAgents]); // Include all dependencies

  /**
   * Filter projects based on search
   * Case-insensitive search by project name
   */
  const filteredProjects = agents.filter(project =>
    project.project_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  /**
   * Manual refresh handler
   * Allows users to refresh the project list
   */
  const handleRefresh = () => {
    fetchAgents();
  };

  /**
   * Mouse event handlers for resizing
   */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    
    const newWidth = e.clientX;
    if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
      setSidebarWidth(newWidth);
    }
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  // Add mouse event listeners
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  /**
   * Render settings content based on active tab
   * 
   * Dynamically renders the appropriate settings component
   * based on the currently selected tab and project.
   * 
   * @returns Settings component or empty state
   */
  const renderSettingsContent = () => {
    // Show empty state if no project selected
    if (!selectedProject) {
      return (
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <Bot className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              No Project Selected
            </h3>
            <p className="text-muted-foreground">
              Select a project from the sidebar to view and edit its settings
            </p>
          </div>
        </div>
      );
    }

    // Render appropriate settings component based on active tab
    switch (activeTab) {
      case 'general':
        return <GeneralSettings project={selectedProject} />;
      case 'appearance':
        return <AppearanceSettings project={selectedProject} />;
      case 'behavior':
        return <BehaviorSettings project={selectedProject} />;
      case 'sources':
        return <SourcesSettings project={selectedProject} />;
      case 'pages':
        return <PagesSettings project={selectedProject} />;
      case 'conversations':
        return <ConversationsSettings project={selectedProject} />;
      case 'analytics':
        return <ReportsAnalytics project={selectedProject} />;
      case 'intelligence':
        return <CustomerIntelligenceTab agentId={selectedProject.id} agentName={selectedProject.project_name} />;
      case 'messages-citations':
        return <MessagesAndCitations project={selectedProject} />;
      case 'advanced':
        return <AdvancedSettings project={selectedProject} />;
      case 'business-licensing':
        return <BusinessAndLicensing project={selectedProject} />;
      case 'security':
        return <SecurityAndPrivacy project={selectedProject} />;
      default:
        return null;
    }
  };

  // Render mobile version on mobile devices
  if (isMobile) {
    console.log('🔍 [Projects Page] Rendering mobile version');
    return (
      <PageLayout showNavbar={false}>
        <MobileProjectsPage />
      </PageLayout>
    );
  }
  
  console.log('🔍 [Projects Page] Rendering desktop version');

  return (
    <PageLayout>
      <TurnstileGate>
        <div className="h-[calc(100vh-4rem)] flex bg-background relative">
          {/* Left Sidebar - Project List */}
        <div 
          ref={sidebarRef}
          style={{ width: `${sidebarWidth}px` }}
          className="bg-card border-r border-border flex flex-col flex-shrink-0 relative"
        >
          {/* Sidebar Header */}
          <div className="p-5 border-b border-border">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-xl font-bold text-foreground">Projects</h1>
              {/* Refresh button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={loading}
                className="h-8"
              >
                <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
              </Button>
            </div>
            
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-background text-foreground"
                aria-label="Search projects"
              />
              {/* Loading indicator when fetching all projects for search */}
              {isLoadingAllForSearch && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <RefreshCw className="w-4 h-4 animate-spin text-brand-500" />
                </div>
              )}
            </div>
            
            {/* Search loading message */}
            {isLoadingAllForSearch && paginationMeta && (
              <p className="text-xs text-muted-foreground mt-2">
                Loading all projects for search... ({agents.length} of {paginationMeta.totalCount})
              </p>
            )}
          </div>

          {/* Projects List */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {/* Loading skeleton */}
            {loading && agents.length === 0 ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="p-4 border border-border rounded-lg animate-pulse">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-muted rounded-lg" />
                      <div className="flex-1">
                        <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                        <div className="h-3 bg-muted rounded w-1/2" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredProjects.length === 0 ? (
              // Empty state
              <div className="text-center py-8">
                <Bot className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">
                  {searchQuery ? 'No projects found' : 'No projects available'}
                </p>
              </div>
            ) : (
              <>
                {/* Project cards */}
                {filteredProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    isSelected={selectedProject?.id === project.id}
                    onClick={() => {
                      setSelectedProject(project);
                      router.push(`/projects?id=${project.id}`);
                    }}
                  />
                ))}
                
                {/* Load More Button */}
                {!searchQuery && paginationMeta?.hasMore && (
                  <div className="pt-3 border-t border-border">
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          await loadMoreAgents();
                        } catch (error) {
                          console.error('Failed to load more projects:', error);
                        }
                      }}
                      disabled={loading}
                      className="w-full"
                    >
                      {loading ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4 mr-2" />
                          Load More Projects ({agents.length} of {paginationMeta.totalCount})
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Resize Handle */}
        <div
          onMouseDown={handleMouseDown}
          className={cn(
            "absolute top-0 w-2 h-full cursor-col-resize hover:bg-blue-200 transition-colors z-10",
            "group flex items-center justify-center",
            isResizing && "bg-blue-300"
          )}
          style={{ left: `${sidebarWidth - 1}px` }}
          title="Drag to resize sidebar"
        >
          <div className={cn(
            "w-6 h-16 bg-muted-foreground rounded-full flex items-center justify-center transition-all opacity-0",
            "group-hover:opacity-100 group-hover:scale-110 group-hover:bg-brand-500",
            isResizing && "opacity-100 bg-brand-600 scale-110"
          )}>
            <GripVertical className="w-4 h-4 text-white" />
          </div>
        </div>

        {/* Center and Right Content */}
        <div className="flex-1 flex" style={{ marginLeft: '4px' }}>
          {/* Center Panel - Settings Tabs */}
          {selectedProject && (
            <div className="w-56 bg-card border-r border-border flex flex-col flex-shrink-0">
              {/* Selected project header */}
              <div className="p-3 border-b border-border flex-shrink-0">
                <h2 className="text-sm font-semibold text-foreground truncate">
                  {selectedProject.project_name}
                </h2>
                <p className="text-xs text-muted-foreground">Project Settings</p>
              </div>
              
              {/* Settings tabs list */}
              <div className="flex-1 overflow-y-auto">
                {settingsTabs.map((tab) => (
                  <SettingsTabButton
                    key={tab.id}
                    tab={tab}
                    isActive={activeTab === tab.id}
                    onClick={() => setActiveTab(tab.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Right Panel - Settings Content */}
          <div className="flex-1 bg-card overflow-y-auto overflow-x-hidden">
            {renderSettingsContent()}
          </div>
        </div>
        </div>
      </TurnstileGate>
    </PageLayout>
  );
}

/**
 * Projects Page Component
 * 
 * Main project management interface with three-column layout.
 * Wraps the content in Suspense to handle useSearchParams.
 */
export default function ProjectsPage() {
  return (
    <Suspense fallback={
      <PageLayout>
        <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
        </div>
      </PageLayout>
    }>
      <ProjectsPageContent />
    </Suspense>
  );
}