/**
 * Settings Page
 * 
 * Application settings management interface for CustomGPT UI.
 * Now focuses on theme settings and server configuration info.
 * 
 * Features:
 * - Theme selection (light/dark)
 * - Server configuration status
 * - Security information
 * - Application info
 * 
 * Security Note:
 * - API key is now stored on server only
 * - No client-side API key management
 * - Server handles all authentication
 */

'use client';

import React, { useState, useEffect } from 'react';
import {
  Settings,
  Sun,
  Moon,
  Shield,
  Server,
  CheckCircle,
  AlertCircle,
  Info,
  Activity,
  Home,
  Users,
  BarChart3,
  Ban,
} from 'lucide-react';
import { toast } from 'sonner';

import { useConfigStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageLayout } from '@/components/layout/PageLayout';
import { cn } from '@/lib/utils';
import { useBreakpoint } from '@/hooks/useMediaQuery';
import { RateLimitingSettings } from '@/components/settings/RateLimitingSettings';
import { AdminDashboard } from '@/components/settings/admin/AdminDashboard';
import { AdminUsers } from '@/components/settings/admin/AdminUsers';
import { AdminConfiguration } from '@/components/settings/admin/AdminConfiguration';
// AdminAnalytics removed - was showing fake/generated data
// import { AdminAnalytics } from '@/components/settings/admin/AdminAnalytics';
import { AdminDemo } from '@/components/settings/admin/AdminDemo';
import { AgentRateLimits } from '@/components/settings/admin/AgentRateLimits';
import { IPManagement } from '@/components/settings/admin/IPManagement';

/**
 * Settings Page Component
 * 
 * Settings interface for theme and viewing server status
 */
type SettingsTab = 'general' | 'rate-limiting';
type RateLimitingTab = 'dashboard' | 'users' | 'configuration' | 'demo' | 'agents' | 'ip-management';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [activeRateLimitingTab, setActiveRateLimitingTab] = useState<RateLimitingTab>('dashboard');
  const [serverStatus, setServerStatus] = useState<'checking' | 'configured' | 'not-configured'>('checking');
  const [rateLimitingAvailable, setRateLimitingAvailable] = useState<boolean>(false);
  const { theme, setTheme } = useConfigStore();
  const { isMobile } = useBreakpoint();

  // Check server configuration status and rate limiting availability
  useEffect(() => {
    const checkServerStatus = async () => {
      try {
        const response = await fetch('/api/proxy/projects');
        if (response.ok) {
          setServerStatus('configured');
        } else {
          setServerStatus('not-configured');
        }
      } catch (error) {
        setServerStatus('not-configured');
      }
    };

    const checkRateLimitingAvailability = async () => {
      try {
        const response = await fetch('/api/admin/health');
        if (response.ok) {
          const data = await response.json();
          // Check if Redis is configured and connected
          const redisConfigured = data.data?.services?.redis?.connected === true;
          setRateLimitingAvailable(redisConfigured);
        } else {
          setRateLimitingAvailable(false);
        }
      } catch (error) {
        setRateLimitingAvailable(false);
      }
    };
    
    checkServerStatus();
    checkRateLimitingAvailability();
  }, []);

  // Admin authentication is no longer required
  

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
    toast.success(`Theme changed to ${newTheme} mode`);
  };
  

  return (
    <PageLayout showMobileNavigation={isMobile} pageTitle="Settings">
      <div className={cn(
        "h-full flex flex-col",
        isMobile ? "bg-background" : "max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8"
      )}>
        {/* Mobile Header */}
        {isMobile && (
          <div className="flex-shrink-0 px-4 py-4 border-b border-border bg-background/95 backdrop-blur-sm">
            <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              Settings
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              App preferences and configuration
            </p>
          </div>
        )}

        {/* Desktop Header */}
        {!isMobile && (
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Settings className="w-8 h-8 text-primary" />
              Settings
            </h1>
            <p className="mt-2 text-muted-foreground">
              Manage your application preferences and configuration
            </p>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="border-b border-border">
          <nav className={cn(
            "flex space-x-8",
            isMobile ? "px-4" : ""
          )}>
            <button
              onClick={() => setActiveTab('general')}
              className={cn(
                "py-4 px-1 border-b-2 font-medium text-sm transition-colors",
                activeTab === 'general'
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300"
              )}
            >
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                General
              </div>
            </button>
            {rateLimitingAvailable && (
              <button
                onClick={() => setActiveTab('rate-limiting')}
                className={cn(
                  "py-4 px-1 border-b-2 font-medium text-sm transition-colors",
                  activeTab === 'rate-limiting'
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300"
                )}
              >
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Rate Limiting
                </div>
              </button>
            )}
          </nav>
        </div>

        {/* Scrollable Content */}
        <div className={cn(
          "flex-1 overflow-y-auto",
          isMobile ? "px-4 py-4 pb-20 space-y-6" : "space-y-6"
        )}>
          {activeTab === 'general' && (
            <>
          {/* Server Configuration Status */}
          <Card className={cn(
            "bg-card text-card-foreground border-border",
            isMobile ? "p-5" : "p-6"
          )}>
            <div className="flex items-start gap-4">
              <div className={cn(
                "rounded-lg flex items-center justify-center flex-shrink-0",
                isMobile ? "p-2.5 w-10 h-10" : "p-3 w-12 h-12",
                "bg-primary/10"
              )}>
                <Server className={cn(
                  "text-primary",
                  isMobile ? "w-5 h-5" : "w-6 h-6"
                )} />
              </div>
              <div className="flex-1">
                <h2 className={cn(
                  "font-semibold text-foreground mb-3",
                  isMobile ? "text-base" : "text-lg"
                )}>
                  Server Configuration
                </h2>
              
              {serverStatus === 'checking' && (
                <div className={cn(
                  "flex items-center gap-2 text-muted-foreground",
                  isMobile ? "text-sm" : ""
                )}>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                  Checking server configuration...
                </div>
              )}
              
              {serverStatus === 'configured' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-success">
                    <CheckCircle className={cn(
                      isMobile ? "w-4 h-4" : "w-5 h-5"
                    )} />
                    <span className={cn(
                      "font-medium",
                      isMobile ? "text-sm" : ""
                    )}>Server configured successfully</span>
                  </div>
                  <p className={cn(
                    "text-muted-foreground",
                    isMobile ? "text-xs" : "text-sm"
                  )}>
                    Your server is properly configured with the CustomGPT API key.
                    All API requests are securely proxied through your server.
                  </p>
                </div>
              )}
              
              {serverStatus === 'not-configured' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-warning">
                    <AlertCircle className={cn(
                      isMobile ? "w-4 h-4" : "w-5 h-5"
                    )} />
                    <span className={cn(
                      "font-medium",
                      isMobile ? "text-sm" : ""
                    )}>Server configuration required</span>
                  </div>
                  <p className={cn(
                    "text-muted-foreground",
                    isMobile ? "text-xs" : "text-sm"
                  )}>
                    Please configure your server with the CustomGPT API key.
                    See the setup instructions for details.
                  </p>
                  <div className={cn(
                    "bg-muted rounded-lg mt-3",
                    isMobile ? "p-3" : "p-4"
                  )}>
                    <h4 className={cn(
                      "font-medium text-foreground mb-2",
                      isMobile ? "text-sm" : ""
                    )}>Quick Setup:</h4>
                    <ol className={cn(
                      "text-muted-foreground space-y-1",
                      isMobile ? "text-xs" : "text-sm"
                    )}>
                      <li>1. Copy <code className="bg-secondary px-1 rounded">.env.example</code> to <code className="bg-secondary px-1 rounded">.env.local</code></li>
                      <li>2. Add your API key: <code className="bg-secondary px-1 rounded">CUSTOMGPT_API_KEY=your_key</code></li>
                      <li>3. Restart the development server</li>
                    </ol>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>

          {/* Theme Settings */}
          <Card className={cn(
            "bg-card text-card-foreground border-border",
            isMobile ? "p-5" : "p-6"
          )}>
            <div className="flex items-start gap-4">
              <div className={cn(
                "bg-accent rounded-lg flex items-center justify-center flex-shrink-0",
                isMobile ? "p-2.5 w-10 h-10" : "p-3 w-12 h-12"
              )}>
                {theme === 'light' ? (
                  <Sun className={cn(
                    "text-accent-foreground",
                    isMobile ? "w-5 h-5" : "w-6 h-6"
                  )} />
                ) : (
                  <Moon className={cn(
                    "text-accent-foreground",
                    isMobile ? "w-5 h-5" : "w-6 h-6"
                  )} />
                )}
              </div>
              <div className="flex-1">
                <h2 className={cn(
                  "font-semibold text-foreground mb-3",
                  isMobile ? "text-base" : "text-lg"
                )}>
                  Appearance
                </h2>
                <p className={cn(
                  "text-muted-foreground mb-4",
                  isMobile ? "text-xs" : "text-sm"
                )}>
                  Choose your preferred color theme. Changes apply immediately across the entire application.
                </p>
                
                <div className={cn(
                  "flex mb-4",
                  isMobile ? "gap-2" : "gap-3"
                )}>
                  <Button
                    variant={theme === 'light' ? 'default' : 'outline'}
                    onClick={() => handleThemeChange('light')}
                    size={isMobile ? "sm" : "sm"}
                    className={cn(
                      "flex items-center gap-2",
                      isMobile ? "flex-1 h-10 text-sm touch-target" : ""
                    )}
                  >
                    <Sun className={cn(
                      isMobile ? "w-4 h-4" : "w-4 h-4"
                    )} />
                    Light
                  </Button>
                  <Button
                    variant={theme === 'dark' ? 'default' : 'outline'}
                    onClick={() => handleThemeChange('dark')}
                    size={isMobile ? "sm" : "sm"}
                    className={cn(
                      "flex items-center gap-2",
                      isMobile ? "flex-1 h-10 text-sm touch-target" : ""
                    )}
                  >
                    <Moon className={cn(
                      isMobile ? "w-4 h-4" : "w-4 h-4"
                    )} />
                    Dark
                  </Button>
                </div>
                
                {/* Theme preview - hide on mobile to save space */}
                {!isMobile && (
                  <div className="bg-muted rounded-lg p-4 space-y-3">
                    <h4 className="text-sm font-medium text-foreground">Theme Preview</h4>
                    <div className="flex gap-2 flex-wrap">
                      <div className="w-6 h-6 bg-background border-2 border-border rounded-md" title="Background"></div>
                      <div className="w-6 h-6 bg-primary rounded-md" title="Primary"></div>
                      <div className="w-6 h-6 bg-secondary rounded-md" title="Secondary"></div>
                      <div className="w-6 h-6 bg-accent rounded-md" title="Accent"></div>
                      <div className="w-6 h-6 bg-muted rounded-md" title="Muted"></div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Currently using <strong>{theme}</strong> theme
                    </p>
                  </div>
                )}
              </div>
            </div>
          </Card>
          

          {/* Security Information */}
          <Card className={cn(
            "bg-card text-card-foreground border-border",
            isMobile ? "p-5" : "p-6"
          )}>
          <div className="flex items-start gap-4">
            <div className={cn(
              "bg-success/10 rounded-lg flex items-center justify-center flex-shrink-0",
              isMobile ? "p-2.5 w-10 h-10" : "p-3 w-12 h-12"
            )}>
              <Shield className={cn(
                "text-success",
                isMobile ? "w-5 h-5" : "w-6 h-6"
              )} />
            </div>
            <div className="flex-1">
              <h2 className={cn(
                "font-semibold text-foreground mb-3",
                isMobile ? "text-base" : "text-lg"
              )}>
                Security
              </h2>
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <CheckCircle className={cn(
                    "text-success mt-0.5 flex-shrink-0",
                    isMobile ? "w-4 h-4" : "w-5 h-5"
                  )} />
                  <div>
                    <p className={cn(
                      "font-medium text-foreground",
                      isMobile ? "text-sm" : "text-base"
                    )}>API Key Protection</p>
                    <p className={cn(
                      "text-muted-foreground",
                      isMobile ? "text-xs" : "text-sm"
                    )}>
                      Your API key is stored securely on the server and never exposed to the browser
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className={cn(
                    "text-success mt-0.5 flex-shrink-0",
                    isMobile ? "w-4 h-4" : "w-5 h-5"
                  )} />
                  <div>
                    <p className={cn(
                      "font-medium text-foreground",
                      isMobile ? "text-sm" : "text-base"
                    )}>Secure Proxy</p>
                    <p className={cn(
                      "text-muted-foreground",
                      isMobile ? "text-xs" : "text-sm"
                    )}>
                      All API requests are proxied through your server for enhanced security
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className={cn(
                    "text-success mt-0.5 flex-shrink-0",
                    isMobile ? "w-4 h-4" : "w-5 h-5"
                  )} />
                  <div>
                    <p className={cn(
                      "font-medium text-foreground",
                      isMobile ? "text-sm" : "text-base"
                    )}>No Client Storage</p>
                    <p className={cn(
                      "text-muted-foreground",
                      isMobile ? "text-xs" : "text-sm"
                    )}>
                      Sensitive data is never stored in browser localStorage or cookies
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>

          {/* Rate Limiting Status */}
          {!rateLimitingAvailable && (
            <Card className={cn(
              "bg-card text-card-foreground border-border",
              isMobile ? "p-5" : "p-6"
            )}>
            <div className="flex items-start gap-4">
              <div className={cn(
                "bg-warning/10 rounded-lg flex items-center justify-center flex-shrink-0",
                isMobile ? "p-2.5 w-10 h-10" : "p-3 w-12 h-12"
              )}>
                <Activity className={cn(
                  "text-warning",
                  isMobile ? "w-5 h-5" : "w-6 h-6"
                )} />
              </div>
              <div className="flex-1">
                <h2 className={cn(
                  "font-semibold text-foreground mb-3",
                  isMobile ? "text-base" : "text-lg"
                )}>
                  Rate Limiting
                </h2>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-warning">
                    <AlertCircle className={cn(
                      isMobile ? "w-4 h-4" : "w-5 h-5"
                    )} />
                    <span className={cn(
                      "font-medium",
                      isMobile ? "text-sm" : ""
                    )}>Rate limiting features unavailable</span>
                  </div>
                  <p className={cn(
                    "text-muted-foreground",
                    isMobile ? "text-xs" : "text-sm"
                  )}>
                    Rate limiting features require Redis configuration. Configure the following environment variables to enable rate limiting:
                  </p>
                  <div className={cn(
                    "bg-muted rounded-lg mt-3",
                    isMobile ? "p-3" : "p-4"
                  )}>
                    <h4 className={cn(
                      "font-medium text-foreground mb-2",
                      isMobile ? "text-sm" : ""
                    )}>Required Environment Variables:</h4>
                    <div className={cn(
                      "text-muted-foreground space-y-1",
                      isMobile ? "text-xs" : "text-sm"
                    )}>
                      <div><code className="bg-secondary px-1 rounded">UPSTASH_REDIS_REST_URL</code> - Redis URL</div>
                      <div><code className="bg-secondary px-1 rounded">UPSTASH_REDIS_REST_TOKEN</code> - Redis token</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
          )}

          {/* Application Info */}
          <Card className={cn(
            "bg-card text-card-foreground border-border",
            isMobile ? "p-5" : "p-6"
          )}>
          <div className="flex items-start gap-4">
            <div className={cn(
              "bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0",
              isMobile ? "p-2.5 w-10 h-10" : "p-3 w-12 h-12"
            )}>
              <Info className={cn(
                "text-primary",
                isMobile ? "w-5 h-5" : "w-6 h-6"
              )} />
            </div>
            <div className="flex-1">
              <h2 className={cn(
                "font-semibold text-foreground mb-3",
                isMobile ? "text-base" : "text-lg"
              )}>
                About
              </h2>
              <div className={cn(
                "space-y-2 text-muted-foreground",
                isMobile ? "text-xs" : "text-sm"
              )}>
                <p>
                  <span className={cn(
                    "font-medium text-foreground",
                    isMobile ? "text-xs" : "text-sm"
                  )}>Version:</span> 1.0.0
                </p>
                <p>
                  <span className={cn(
                    "font-medium text-foreground",
                    isMobile ? "text-xs" : "text-sm"
                  )}>Environment:</span> {process.env.NODE_ENV}
                </p>
                <p>
                  <span className={cn(
                    "font-medium text-foreground",
                    isMobile ? "text-xs" : "text-sm"
                  )}>API Endpoint:</span> Proxied through /api/proxy/*
                </p>
              </div>
            </div>
          </div>
        </Card>
            </>
          )}
          
          {activeTab === 'rate-limiting' && rateLimitingAvailable && (
            <RateLimitingContent
              activeRateLimitingTab={activeRateLimitingTab}
              setActiveRateLimitingTab={setActiveRateLimitingTab}
              isMobile={isMobile}
            />
          )}
        </div>
      </div>
    </PageLayout>
  );
}

// Rate Limiting Content Component
interface RateLimitingContentProps {
  activeRateLimitingTab: RateLimitingTab;
  setActiveRateLimitingTab: (tab: RateLimitingTab) => void;
  isMobile: boolean;
}

function RateLimitingContent({ 
  activeRateLimitingTab, 
  setActiveRateLimitingTab, 
  isMobile 
}: RateLimitingContentProps) {
  const rateLimitingTabs = [
    { id: 'dashboard' as RateLimitingTab, name: 'Dashboard', icon: Home },
    { id: 'agents' as RateLimitingTab, name: 'Agents', icon: Shield },
    { id: 'ip-management' as RateLimitingTab, name: 'IP Management', icon: Ban },
    { id: 'users' as RateLimitingTab, name: 'Users', icon: Users },
    { id: 'configuration' as RateLimitingTab, name: 'Configuration', icon: Settings },
    // Analytics tab removed - was showing fake/generated data
    { id: 'demo' as RateLimitingTab, name: 'Testing', icon: Activity },
  ];

  return (
    <div className="space-y-6">
      {/* Rate Limiting Sub-Tab Navigation */}
      <div className="border-b border-border">
        <nav className={cn(
          "flex space-x-8 overflow-x-auto custom-scrollbar",
          isMobile ? "px-0" : ""
        )}>
          {rateLimitingTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveRateLimitingTab(tab.id)}
              className={cn(
                "py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap",
                activeRateLimitingTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300"
              )}
            >
              <div className="flex items-center gap-2">
                <tab.icon className="w-4 h-4" />
                {tab.name}
              </div>
            </button>
          ))}
        </nav>
      </div>

      {/* Rate Limiting Tab Content */}
      <div className={cn(
        isMobile ? "space-y-4" : "space-y-6"
      )}>
        {activeRateLimitingTab === 'dashboard' && <RateLimitingSettings />}
        {activeRateLimitingTab === 'agents' && <AgentRateLimits />}
        {activeRateLimitingTab === 'ip-management' && <IPManagement />}
        {activeRateLimitingTab === 'users' && <AdminUsers />}
        {activeRateLimitingTab === 'configuration' && <AdminConfiguration />}
        {/* Analytics tab removed - was showing fake data */}
        {activeRateLimitingTab === 'demo' && <AdminDemo />}
      </div>
    </div>
  );
}