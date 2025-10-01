/**
 * Home Page Component
 * 
 * This is the main entry point of the application.
 * It handles the initial setup flow and renders the chat interface.
 * 
 * Flow:
 * 1. Check if API key is configured
 * 2. If not, show API key setup screen
 * 3. Once configured, show the main chat interface
 * 
 * Key Features:
 * - Conditional rendering based on setup state
 * - Dynamic import of ChatLayout to avoid SSR issues
 * - Toast notifications for user feedback
 * - Responsive layout that fills the viewport
 * 
 * Customization:
 * - Modify ApiKeySetup for different authentication methods
 * - Change ChatLayout mode ('standalone', 'widget', 'floating')
 * - Adjust toast position and styling
 * - Add onboarding or tutorial overlays
 * 
 * Features:
 * - Secure API key management with persistent localStorage
 * - Optimized component loading with dynamic imports
 * - Consistent navigation structure with professional layout
 */

'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { useConfigStore } from '@/store';
import { ApiKeySetupModal } from '@/components/setup/ApiKeySetupModal';
import { PageLayout } from '@/components/layout/PageLayout';
import { useDemoModeContext } from '@/contexts/DemoModeContext';
import type { Agent } from '@/types';
import TurnstileGate from '@/components/chat/TurnstileGate';

/**
 * Dynamic Import of ChatLayout
 * 
 * ChatLayout contains browser-only code (localStorage, window objects)
 * so we disable SSR to prevent hydration mismatches.
 * 
 * This ensures:
 * - No server-side rendering errors
 * - Consistent client-side behavior
 * - Proper access to browser APIs
 * 
 * The loading state is handled by the component itself.
 */
const ChatLayout = dynamic(
  () => import('@/components/chat/ChatLayout').then(mod => ({ default: mod.ChatLayout })),
  { 
    ssr: false // Disable server-side rendering
  }
);

/**
 * Home Page Component
 * 
 * Manages the application's main flow:
 * - Setup flow for new users
 * - Chat interface for configured users
 * 
 * State Management:
 * - isSetupComplete: Tracks whether API key is configured
 * - apiKey: Retrieved from global config store
 * 
 * The component re-renders when apiKey changes,
 * automatically transitioning from setup to chat.
 */
/**
 * Inner component that has access to demo mode context
 */
function HomeContent() {
  // Track setup completion state
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Next.js router for navigation
  const router = useRouter();
  
  // Get runtime demo mode status from context
  const { isRuntimeDemoMode, deploymentMode, isInitialized } = useDemoModeContext();
  
  // Check if embedded and handle refresh if needed
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const isEmbedded = window.self !== window.top;
        if (isEmbedded) {
          // Only refresh once per session
          if (!sessionStorage.getItem('customgpt.embeddedRefreshed')) {
            console.log('[HomeContent] Embedded mode detected, triggering refresh for proper initialization');
            sessionStorage.setItem('customgpt.embeddedRefreshed', 'true');
            setTimeout(() => {
              window.location.reload();
            }, 100);
          }
        } else {
          // Clear the flag when not embedded
          sessionStorage.removeItem('customgpt.embeddedRefreshed');
        }
      } catch (e) {
        // Cross-origin iframe
        if (!sessionStorage.getItem('customgpt.embeddedRefreshed')) {
          console.log('[HomeContent] Cross-origin embed detected, triggering refresh');
          sessionStorage.setItem('customgpt.embeddedRefreshed', 'true');
          setTimeout(() => {
            window.location.reload();
          }, 100);
        }
      }
    }
  }, []);

  useEffect(() => {
    // Wait for context to initialize
    if (!isInitialized) return;
    
    // If no deployment mode selected, let DemoModeProvider handle it
    if (!deploymentMode) {
      setIsLoading(false);
      return;
    }
    
    console.log('[HomeContent] Deployment mode:', deploymentMode, 'isRuntimeDemoMode:', isRuntimeDemoMode);
    
    // In demo mode, skip API key validation
    if (isRuntimeDemoMode) {
      setIsSetupComplete(true);
      setIsLoading(false);
    } else {
      // For production mode, check if server has valid API keys
      console.log('[HomeContent] Checking server-side API keys...');
      
      // Use a simple validation endpoint first
      fetch('/api/proxy/validate-keys')
        .then(response => response.json())
        .then(data => {
          console.log('[HomeContent] API validation result:', data);
          if (data.valid) {
            // Server has valid API keys - skip setup
            console.log('[HomeContent] Valid API keys detected, skipping setup');
            setIsSetupComplete(true);
          } else {
            // Server needs API keys - show setup modal
            console.log('[HomeContent] No valid API keys, showing setup modal');
            setIsSetupComplete(false);
          }
          setIsLoading(false);
        })
        .catch(error => {
          console.log('[HomeContent] API validation error, trying projects endpoint:', error);
          // Fallback to projects endpoint
          fetch('/api/proxy/projects?limit=1')
            .then(response => {
              console.log('[HomeContent] Projects endpoint response:', response.status, response.ok);
              if (response.ok) {
                console.log('[HomeContent] Projects endpoint success, keys are valid');
                setIsSetupComplete(true);
              } else {
                console.log('[HomeContent] Projects endpoint failed, showing setup');
                setIsSetupComplete(false);
              }
              setIsLoading(false);
            })
            .catch(projectError => {
              console.log('[HomeContent] Both validations failed:', projectError);
              setIsSetupComplete(false);
              setIsLoading(false);
            });
        });
    }
  }, [isRuntimeDemoMode, deploymentMode, isInitialized]);

  // Handler for agent settings navigation
  const handleAgentSettings = (agent: Agent) => {
    // Navigate to projects page with the agent ID
    router.push(`/projects?id=${agent.id}`);
  };

  const handleSetupComplete = () => {
    setIsSetupComplete(true);
  };

  // Don't render anything while checking initial state
  if (isLoading || !isInitialized) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  // If no deployment mode selected, DemoModeProvider will show selection screen
  if (!deploymentMode) {
    return null;
  }

  // If in production mode and setup is not complete, show only the setup modal
  if (deploymentMode === 'production' && !isSetupComplete) {
    console.log('[HomeContent] Showing setup modal because isSetupComplete =', isSetupComplete);
    return (
      <ApiKeySetupModal 
        onComplete={handleSetupComplete}
        isDemoMode={false}
      />
    );
  }

  // Otherwise, show the main app layout
  console.log('[HomeContent] Rendering main app with:', { 
    deploymentMode, 
    isRuntimeDemoMode, 
    isSetupComplete 
  });
  
  return (
    <PageLayout showBackButton={false}>
      {/* Container with calculated height to account for navbar */}
      <div className="h-[calc(100vh-4rem)] bg-gray-50">
        {/* Main chat interface in standalone mode with Turnstile protection */}
        {(isRuntimeDemoMode || isSetupComplete) && (
          <TurnstileGate>
            <ChatLayout 
              mode="standalone" 
              onAgentSettings={handleAgentSettings}
            />
          </TurnstileGate>
        )}
        {/* Debug info */}
        {!(isRuntimeDemoMode || isSetupComplete) && (
          <div className="p-4 text-red-600">
            DEBUG: Main app not showing because isRuntimeDemoMode={String(isRuntimeDemoMode)} and isSetupComplete={String(isSetupComplete)}
          </div>
        )}
      </div>
    </PageLayout>
  );
}

/**
 * Main Home component
 */
export default function Home() {
  return <HomeContent />;
}
