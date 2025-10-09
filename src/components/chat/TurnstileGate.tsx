/**
 * Turnstile Gate Component
 * 
 * Conditionally shows Turnstile challenge for anonymous users before
 * allowing access to chat functionality. Integrates with the chat flow
 * to provide seamless bot protection.
 * 
 * Features:
 * - Shows only for IP-based (anonymous) users
 * - Bypasses for authenticated users (JWT/session)
 * - Caches verification to avoid repeated challenges
 * - Integrates with existing chat UI patterns
 * - Handles errors gracefully
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import TurnstileChallenge, { useTurnstileVerification } from '../ui/Turnstile';
import { getVerificationService } from '@/lib/turnstile-verification';

interface TurnstileGateProps {
  /** Child components to render after verification */
  children: React.ReactNode;
  /** Whether the user is authenticated */
  isAuthenticated?: boolean;
  /** Custom CSS classes */
  className?: string;
  /** Callback when verification status changes */
  onVerificationChange?: (verified: boolean, token?: string) => void;
  /** Whether to show the gate in demo/test mode */
  showInDemo?: boolean;
}

/**
 * Hook to check if Turnstile is required for current user
 */
function useTurnstileRequired() {
  const [isRequired, setIsRequired] = useState<boolean | null>(null);
  const [siteKey, setSiteKey] = useState<string | null>(null);

  useEffect(() => {
    // Check Turnstile configuration
    async function checkTurnstileConfig() {
      try {
        const response = await fetch('/api/turnstile/verify', {
          method: 'GET',
        });
        
        if (response.ok) {
          const config = await response.json();
          setIsRequired(config.enabled && config.configured);
          setSiteKey(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null);
        } else {
          setIsRequired(false);
        }
      } catch (error) {
        console.error('Failed to check Turnstile config:', error);
        setIsRequired(false);
      }
    }

    checkTurnstileConfig();
  }, []);

  return { isRequired, siteKey };
}

/**
 * TurnstileGate Component
 * 
 * Acts as a gate that conditionally shows Turnstile challenge
 * before allowing access to protected functionality.
 */
export const TurnstileGate: React.FC<TurnstileGateProps> = ({
  children,
  isAuthenticated = false,
  className,
  onVerificationChange,
  showInDemo = false
}) => {
  const { isRequired, siteKey } = useTurnstileRequired();
  const {
    isVerified,
    currentToken,
    isVerificationValid,
    handleVerificationSuccess,
    clearVerification,
    handleVerificationExpiry
  } = useTurnstileVerification();

  const verificationService = getVerificationService();
  const [showChallenge, setShowChallenge] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Determine if we should show the Turnstile challenge
  useEffect(() => {
    if (isRequired === null) return; // Still loading config

    setIsLoading(false);

    // Don't show for authenticated users (unless in demo mode)
    if (isAuthenticated && !showInDemo) {
      setShowChallenge(false);
      onVerificationChange?.(true);
      return;
    }

    // Don't show if Turnstile is not required/configured
    if (!isRequired || !siteKey) {
      setShowChallenge(false);
      onVerificationChange?.(true);
      return;
    }

    // Check if we have valid cached verification
    if (isVerificationValid()) {
      setShowChallenge(false);
      onVerificationChange?.(true, currentToken || undefined);
      return;
    }

    // Show challenge for anonymous users
    setShowChallenge(true);
    onVerificationChange?.(false);
  }, [isRequired, siteKey, isAuthenticated, showInDemo, isVerificationValid, currentToken, onVerificationChange]);

  // Handle successful verification
  const handleSuccess = useCallback(async (token: string) => {
    try {
      console.log('[TurnstileGate] Starting verification process for token');

      // Use the verification service to cache the verification (only calls server if not cached)
      const success = await verificationService.verifyAndCache(token);
      console.log('[TurnstileGate] Verification service result:', success);

      if (success) {
        // Update the hook state (this will check if already verified and skip server call)
        await handleVerificationSuccess(token);
        setShowChallenge(false);
        setError(null);

        // Store token for API client usage (legacy compatibility)
        if (typeof window !== 'undefined') {
          const tokenData = {
            token,
            expiresAt: Date.now() + (60 * 60 * 1000), // 1 hour
            timestamp: Date.now()
          };

          try {
            sessionStorage.setItem('customgpt.turnstileToken', JSON.stringify(tokenData));
          } catch (e) {
            console.warn('[TurnstileGate] Failed to store token:', e);
          }
        }

        onVerificationChange?.(true, token);
        toast.success('Human verification complete!');
      } else {
        throw new Error('Failed to verify token');
      }
    } catch (error) {
      console.error('[TurnstileGate] Verification failed:', error);
      setError(error instanceof Error ? error.message : 'Verification failed');
      onVerificationChange?.(false);
    }
  }, [handleVerificationSuccess, onVerificationChange, verificationService]);

  // Handle verification error
  const handleError = useCallback((error: string) => {
    setError(error);
    onVerificationChange?.(false);
    console.error('Turnstile verification error:', error);
  }, [onVerificationChange]);

  // Handle token expiry
  const handleExpire = useCallback(() => {
    handleVerificationExpiry();
    setShowChallenge(true);
    
    // Clear stored token
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem('customgpt.turnstileToken');
        localStorage.removeItem('customgpt.turnstileToken');
        console.log('[TurnstileGate] Expired token cleared');
      } catch (e) {
        console.warn('[TurnstileGate] Failed to clear token:', e);
      }
    }
    
    onVerificationChange?.(false);
    toast.warning('Verification expired. Please complete the challenge again.');
  }, [handleVerificationExpiry, onVerificationChange]);

  // Handle manual retry
  const handleRetry = useCallback(() => {
    clearVerification();
    setError(null);
    setShowChallenge(true);
    onVerificationChange?.(false);
  }, [clearVerification, onVerificationChange]);

  // Show loading state while checking configuration
  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center min-h-[400px] w-full', className)}>
        <div className="flex items-center gap-3 text-muted-foreground">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          >
            <Shield className="w-6 h-6" />
          </motion.div>
          <span className="text-base">Checking security requirements...</span>
        </div>
      </div>
    );
  }

  // If no challenge needed, render children directly
  if (!showChallenge) {
    return <>{children}</>;
  }

  // Render Turnstile challenge
  return (
    <div className={cn('turnstile-gate flex items-center justify-center min-h-[600px] w-full', className)}>
      <AnimatePresence mode="wait">
        <motion.div
          key="challenge"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className="max-w-md w-full mx-auto px-4"
        >
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full mb-6">
              <Shield className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-2xl font-semibold text-foreground mb-3">
              Security Verification
            </h2>
            <p className="text-base text-muted-foreground leading-relaxed">
              Please complete this quick security check to continue chatting. 
              This helps us prevent automated abuse.
            </p>
          </div>

          {/* Turnstile Challenge */}
          <div className="flex justify-center mb-8">
            <div className="w-full max-w-xs">
              <TurnstileChallenge
                siteKey={siteKey!}
                onSuccess={handleSuccess}
                onError={handleError}
                onExpire={handleExpire}
                theme="auto"
                size="normal"
                action="chat-access"
                className="w-full"
              />
            </div>
          </div>

          {/* Error State */}
          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg mb-6"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-destructive mb-1">
                    Verification Failed
                  </h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    {error}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRetry}
                    className="text-xs"
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Try Again
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Help Text */}
          <div className="text-center">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Having trouble? This verification is provided by Cloudflare and 
              helps protect against automated attacks.
            </p>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

/**
 * Turnstile Status Indicator
 * 
 * Shows current verification status in the UI
 */
export const TurnstileStatus: React.FC<{
  isVerified: boolean;
  className?: string;
}> = ({ isVerified, className }) => {
  if (!isVerified) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'inline-flex items-center gap-2 px-2 py-1 bg-green-50 dark:bg-green-900/20',
        'border border-green-200 dark:border-green-800 rounded-md text-xs text-green-700 dark:text-green-400',
        className
      )}
    >
      <CheckCircle className="w-3 h-3" />
      <span>Verified Human</span>
    </motion.div>
  );
};

export default TurnstileGate;
