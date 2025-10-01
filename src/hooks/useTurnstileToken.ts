/**
 * Turnstile Token Management Hook
 * 
 * Provides utilities for managing Turnstile tokens in API calls.
 * Handles token storage, validation, and automatic inclusion in requests.
 */

'use client';

import { useState, useCallback, useRef } from 'react';

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

  /**
   * Store a new Turnstile token
   */
  const setToken = useCallback((token: string) => {
    const expiresAt = Date.now() + (5 * 60 * 1000); // 5 minutes from now
    
    setTokenState({
      token,
      expiresAt,
      isValid: true,
    });
    
    tokenRef.current = token;
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
  }, []);

  /**
   * Check if current token is valid
   */
  const isTokenValid = useCallback(() => {
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
    getTurnstileHeaders,
    fetchWithTurnstile,
  };
}

export default useTurnstileToken;
