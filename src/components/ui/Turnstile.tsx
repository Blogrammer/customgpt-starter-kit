/**
 * Cloudflare Turnstile Component
 * 
 * React wrapper for Cloudflare Turnstile human verification widget.
 * Provides bot protection for anonymous users and API endpoints.
 * 
 * Security Features:
 * - Server-side token verification only
 * - No secrets exposed to client-side
 * - Token replay attack prevention
 * - Graceful error handling and retry logic
 * 
 * Usage:
 * - Shows challenge for IP-based (anonymous) users
 * - Bypasses challenge for authenticated JWT users (configurable)
 * - Integrates with rate limiting middleware
 * - Caches valid tokens to avoid repeated challenges
 */

'use client';

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// Turnstile script URL
const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

// Global interface for Turnstile API
declare global {
  interface Window {
    turnstile?: {
      render: (element: string | HTMLElement, options: TurnstileRenderOptions) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
      getResponse: (widgetId?: string) => string;
    };
  }
}

interface TurnstileRenderOptions {
  sitekey: string;
  callback?: (token: string) => void;
  'error-callback'?: (error: string) => void;
  'expired-callback'?: () => void;
  'timeout-callback'?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  size?: 'normal' | 'compact';
  action?: string;
  cData?: string;
  'retry-interval'?: number;
  'refresh-expired'?: 'auto' | 'manual' | 'never';
}

export interface TurnstileProps {
  /** Cloudflare Turnstile site key (public) */
  siteKey: string;
  /** Callback when challenge is successfully completed */
  onSuccess: (token: string) => void;
  /** Callback when an error occurs */
  onError?: (error: string) => void;
  /** Callback when token expires */
  onExpire?: () => void;
  /** Callback when challenge times out */
  onTimeout?: () => void;
  /** Theme preference */
  theme?: 'light' | 'dark' | 'auto';
  /** Widget size */
  size?: 'normal' | 'compact';
  /** Action identifier for verification */
  action?: string;
  /** Custom data to pass with challenge */
  cData?: string;
  /** Additional CSS classes */
  className?: string;
  /** Whether the component is disabled */
  disabled?: boolean;
  /** Retry interval in milliseconds */
  retryInterval?: number;
  /** How to handle expired tokens */
  refreshExpired?: 'auto' | 'manual' | 'never';
}

/**
 * TurnstileChallenge Component
 * 
 * Renders Cloudflare Turnstile widget with comprehensive error handling,
 * retry logic, and loading states. Automatically loads Turnstile script
 * and manages widget lifecycle.
 */
export const TurnstileChallenge: React.FC<TurnstileProps> = ({
  siteKey,
  onSuccess,
  onError,
  onExpire,
  onTimeout,
  theme = 'auto',
  size = 'normal',
  action,
  cData,
  className,
  disabled = false,
  retryInterval = 8000,
  refreshExpired = 'auto'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // Check if Turnstile script is already loaded
  const isScriptAlreadyLoaded = useCallback(() => {
    return typeof window !== 'undefined' && !!window.turnstile;
  }, []);

  // Load Turnstile script dynamically
  const loadTurnstileScript = useCallback(() => {
    return new Promise<void>((resolve, reject) => {
      if (isScriptAlreadyLoaded()) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = TURNSTILE_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      
      script.onload = () => {
        // Wait a bit for the script to initialize
        setTimeout(() => {
          if (window.turnstile) {
            resolve();
          } else {
            reject(new Error('Turnstile script loaded but API not available'));
          }
        }, 100);
      };
      
      script.onerror = () => {
        reject(new Error('Failed to load Turnstile script'));
      };

      // Remove any existing script first
      const existingScript = document.querySelector(`script[src="${TURNSTILE_SCRIPT_URL}"]`);
      if (existingScript) {
        existingScript.remove();
      }

      document.head.appendChild(script);

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!window.turnstile) {
          reject(new Error('Turnstile script load timeout'));
        }
      }, 10000);
    });
  }, [isScriptAlreadyLoaded]);

  // Render Turnstile widget
  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile || !siteKey) {
      return;
    }

    try {
      // Remove existing widget if present
      if (widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch (e) {
          console.warn('Failed to remove existing Turnstile widget:', e);
        }
        widgetIdRef.current = null;
      }

      // Clear container
      containerRef.current.innerHTML = '';

      // Render new widget
      const widgetId = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme,
        size,
        action,
        cData,
        'retry-interval': retryInterval,
        'refresh-expired': refreshExpired,
        callback: (token: string) => {
          setIsCompleted(true);
          setError(null);
          setIsRetrying(false);
          onSuccess(token);
        },
        'error-callback': (error: string) => {
          console.error('Turnstile error:', error);
          setError(error);
          setIsCompleted(false);
          setIsRetrying(false);
          onError?.(error);
          
          // Show user-friendly error message
          toast.error('Verification failed. Please try again.');
        },
        'expired-callback': () => {
          console.warn('Turnstile token expired');
          setIsCompleted(false);
          setError('Token expired');
          onExpire?.();
          
          // Auto-refresh if configured
          if (refreshExpired === 'auto') {
            setTimeout(() => {
              resetWidget();
            }, 1000);
          }
        },
        'timeout-callback': () => {
          console.warn('Turnstile timeout');
          setError('Challenge timeout');
          setIsCompleted(false);
          setIsRetrying(false);
          onTimeout?.();
          
          toast.error('Verification timeout. Please try again.');
        }
      });

      widgetIdRef.current = widgetId;
      setIsLoading(false);
      setError(null);
    } catch (err) {
      console.error('Failed to render Turnstile widget:', err);
      setError('Failed to load verification widget');
      setIsLoading(false);
      onError?.('Failed to render widget');
    }
  }, [siteKey, theme, size, action, cData, retryInterval, refreshExpired, onSuccess, onError, onExpire, onTimeout]);

  // Reset widget
  const resetWidget = useCallback(() => {
    if (widgetIdRef.current && window.turnstile) {
      try {
        setIsRetrying(true);
        setIsCompleted(false);
        setError(null);
        window.turnstile.reset(widgetIdRef.current);
        setIsRetrying(false);
      } catch (err) {
        console.error('Failed to reset Turnstile widget:', err);
        // If reset fails, try to re-render
        renderWidget();
      }
    } else {
      // If no widget ID, re-render
      renderWidget();
    }
  }, [renderWidget]);

  // Initialize Turnstile
  const initializeTurnstile = useCallback(async () => {
    if (disabled) return;

    try {
      setIsLoading(true);
      setError(null);
      
      await loadTurnstileScript();
      setIsScriptLoaded(true);
      
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        renderWidget();
      }, 100);
    } catch (err) {
      console.error('Failed to initialize Turnstile:', err);
      setError(err instanceof Error ? err.message : 'Failed to load verification');
      setIsLoading(false);
      setIsScriptLoaded(false);
      onError?.(err instanceof Error ? err.message : 'Initialization failed');
    }
  }, [disabled, loadTurnstileScript, renderWidget, onError]);

  // Initialize on mount
  useEffect(() => {
    initializeTurnstile();
  }, [initializeTurnstile]);

  // Re-render widget when props change
  useEffect(() => {
    if (isScriptLoaded && !disabled) {
      renderWidget();
    }
  }, [isScriptLoaded, disabled, siteKey, theme, size, action, cData, renderWidget]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch (e) {
          console.warn('Failed to cleanup Turnstile widget:', e);
        }
      }
    };
  }, []);

  // Handle manual retry
  const handleRetry = useCallback(() => {
    resetWidget();
  }, [resetWidget]);

  if (disabled) {
    return null;
  }

  return (
    <div className={cn('turnstile-container', className)}>
      {/* Loading State */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center p-6 bg-muted/50 rounded-lg border-2 border-dashed"
          >
            <div className="flex items-center gap-3 text-muted-foreground">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                <Shield className="w-5 h-5" />
              </motion.div>
              <span className="text-sm font-medium">Loading verification...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error State */}
      <AnimatePresence>
        {error && !isLoading && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-medium text-destructive mb-1">
                  Verification Error
                </h3>
                <p className="text-sm text-muted-foreground mb-3">
                  {error === 'Failed to load Turnstile script' 
                    ? 'Unable to load verification service. Please check your internet connection.'
                    : error === 'Token expired'
                    ? 'Verification expired. Please complete the challenge again.'
                    : error === 'Challenge timeout'
                    ? 'Verification timed out. Please try again.'
                    : 'Verification failed. Please try again.'
                  }
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRetry}
                  disabled={isRetrying}
                  className="text-xs"
                >
                  {isRetrying ? (
                    <>
                      <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                      Retrying...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Try Again
                    </>
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success State */}
      <AnimatePresence>
        {isCompleted && !error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-4 bg-green-50 border border-green-200 rounded-lg"
          >
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <div>
                <h3 className="text-sm font-medium text-green-800">
                  Verification Complete
                </h3>
                <p className="text-sm text-green-600">
                  You have been verified as human.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Turnstile Widget Container */}
      <div
        ref={containerRef}
        className={cn(
          'turnstile-widget',
          (isLoading || error) && 'hidden'
        )}
        style={{ minHeight: size === 'compact' ? '65px' : '65px' }}
      />
    </div>
  );
};

/**
 * Hook for managing Turnstile verification state
 * 
 * Provides utilities for checking verification status,
 * caching tokens, and handling verification flow.
 */
export const useTurnstileVerification = () => {
  const [isVerified, setIsVerified] = useState(false);
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const [lastVerified, setLastVerified] = useState<number | null>(null);

  // Check if verification is still valid (5 minute cache)
  const isVerificationValid = useCallback(() => {
    if (!isVerified || !lastVerified || !currentToken) {
      return false;
    }
    
    const fiveMinutes = 5 * 60 * 1000;
    return Date.now() - lastVerified < fiveMinutes;
  }, [isVerified, lastVerified, currentToken]);

  // Handle successful verification
  const handleVerificationSuccess = useCallback(async (token: string) => {
    try {
      // Call server verification endpoint to cache the verification
      const response = await fetch('/api/turnstile/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, action: 'api-request' }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setCurrentToken(token);
          setIsVerified(true);
          setLastVerified(Date.now());
          console.log('[Turnstile] Server verification successful');
        } else {
          console.error('[Turnstile] Server verification failed:', result);
          throw new Error(result.message || 'Verification failed');
        }
      } else {
        const error = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error('[Turnstile] Server verification error:', error);
        throw new Error(error.message || 'Server verification failed');
      }
    } catch (error) {
      console.error('[Turnstile] Verification error:', error);
      // Don't update state on error
      throw error;
    }
  }, []);

  // Clear verification state
  const clearVerification = useCallback(() => {
    setCurrentToken(null);
    setIsVerified(false);
    setLastVerified(null);
  }, []);

  // Handle verification expiry
  const handleVerificationExpiry = useCallback(() => {
    clearVerification();
  }, [clearVerification]);

  return {
    isVerified,
    currentToken,
    isVerificationValid,
    handleVerificationSuccess,
    clearVerification,
    handleVerificationExpiry
  };
};

export default TurnstileChallenge;
