/**
 * Turnstile Token Management Hook
 * 
 * Provides utilities for managing Turnstile tokens in API calls.
 * Handles token storage, validation, and automatic inclusion in requests.
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { getVerificationService, getTurnstileConfig } from '@/lib/turnstile-verification';

interface TurnstileTokenState {
  token: string | null;
  expiresAt: number | null;
  isValid: boolean;
}

/**
 * Hook for managing Turnstile tokens
 */
export function useTurnstileToken() {
  const [tokenState, setTokenState] = useState<TurnstileTokenState>({
    token: null,
    expiresAt: null,
    isValid: false,
  });

  const tokenRef = useRef<string | null>(null);
  const verificationService = getVerificationService();

  // Initialize from session storage on mount
  useEffect(() => {
    const isSessionVerified = verificationService.isVerified();
    if (isSessionVerified) {
      setTokenState(prev => ({
        ...prev,
        isValid: true,
      }));
    }
  }, []);

  /**
   * Store a new Turnstile token with longer session duration
   */
  const setToken = useCallback((token: string) => {
    const config = getTurnstileConfig();
    const expiresAt = Date.now() + config.sessionDuration; // Use session duration (default 1 hour)

    setTokenState({
      token,
      expiresAt,
      isValid: true,
    });

    tokenRef.current = token;

    // Also cache in verification service for session persistence
    verificationService.setVerification(Date.now(), expiresAt);
  }, []);

  /**
   * Clear the current token
   */
  const clearToken = useCallback(() => {
    setTokenState({
      token: null,
      expiresAt: null,
      isValid: false,
    });

    tokenRef.current = null;
    verificationService.clearVerification();
  }, []);

  /**
   * Check if current token is valid (check both local state and session storage)
   */
  const isTokenValid = useCallback(() => {
    // First check if session verification is still valid
    if (verificationService.isVerified()) {
      return true;
    }

    // Fallback to local state check
    const { token, expiresAt } = tokenState;

    if (!token || !expiresAt) {
      return false;
    }

    return Date.now() < expiresAt;
  }, [tokenState]);

  /**
   * Get current valid token
   */
  const getValidToken = useCallback(() => {
    if (isTokenValid()) {
      return tokenState.token;
    }

    // Token is expired, clear it
    if (tokenState.token) {
      clearToken();
    }

    return null;
  }, [tokenState, isTokenValid, clearToken]);

  /**
   * Check if verification is needed (for UI display)
   */
  const needsVerification = useCallback(() => {
    return !isTokenValid();
  }, [isTokenValid]);

  /**
   * Get headers with Turnstile token for API requests
   */
  const getTurnstileHeaders = useCallback((): Record<string, string> => {
    const token = getValidToken();
    
    if (!token) {
      return {};
    }
    
    return {
      'X-Turnstile-Token': token,
      'X-Turnstile-Action': 'api-request',
    };
  }, [getValidToken]);

  /**
   * Enhanced fetch wrapper that includes Turnstile token
   */
  const fetchWithTurnstile = useCallback(async (
    url: string, 
    options: RequestInit = {}
  ) => {
    const turnstileHeaders = getTurnstileHeaders();
    
    const enhancedOptions: RequestInit = {
      ...options,
      headers: {
        ...options.headers,
        ...turnstileHeaders,
      } as HeadersInit,
    };
    
    try {
      const response = await fetch(url, enhancedOptions);
      
      // If we get a 403 with Turnstile required, clear the token
      if (response.status === 403) {
        const data = await response.clone().json().catch(() => ({}));
        if (data.turnstileRequired || data.code === 'TURNSTILE_VERIFICATION_REQUIRED') {
          clearToken();
        }
      }
      
      return response;
    } catch (error) {
      throw error;
    }
  }, [getTurnstileHeaders, clearToken]);

  return {
    token: tokenState.token,
    isValid: tokenState.isValid && isTokenValid(),
    expiresAt: tokenState.expiresAt,
    setToken,
    clearToken,
    getValidToken,
    needsVerification,
    getTurnstileHeaders,
    fetchWithTurnstile,
  };
}

export default useTurnstileToken;
