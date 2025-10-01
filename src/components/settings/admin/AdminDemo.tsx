'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Settings, 
  Activity,
  Clock,
  AlertCircle,
  CheckCircle,
  Zap,
  Copy,
  Eye,
  EyeOff,
  Key,
  Cookie,
  Globe,
  Loader2,
  Save
} from 'lucide-react';
import { debounce } from 'lodash';

// Define valid window keys
type WindowType = 'minute' | 'hour' | 'day';

// Define interface for a single window's rate limit data
interface RateLimitWindow {
  current: number;
  limit: number;
  remaining: number;
  resetTime: number;
  resetIn: number;
}

interface RateLimitStatus {
  identity: {
    key: string;
    type: string;
  };
  windows: {
    minute: RateLimitWindow;
    hour: RateLimitWindow;
    day: RateLimitWindow;
  };
  config: {
    limits: {
      minute: number;
      hour: number;
      day: number;
      month: number;
    };
  };
}

interface RateLimitConfig {
  global: {
    defaultPerMinute: number;
    defaultPerHour: number;
    defaultPerDay: number;
  };
}

interface TestResult {
  success: boolean;
  message: string;
  timestamp: string;
  rateLimit?: any;
  details?: any;
  error?: string;
  identityType?: string;
  identityKey?: string;
  headers?: Record<string, string>;
  fullResponse?: any;
}

export function AdminDemo() {
  const [status, setStatus] = useState<RateLimitStatus | null>(null);
  const [config, setConfig] = useState<RateLimitConfig | null>(null);
  const [originalConfig, setOriginalConfig] = useState<RateLimitConfig | null>(null);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isAutoTesting, setIsAutoTesting] = useState(false);
  const [testInterval, setTestInterval] = useState(1000);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customRequestCount, setCustomRequestCount] = useState(5);
  const [customCookie, setCustomCookie] = useState('');
  const [customJWT, setCustomJWT] = useState('');
  const [isCustomTesting, setIsCustomTesting] = useState(false);
  const [currentCookie, setCurrentCookie] = useState('');
  const [currentJWT, setCurrentJWT] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [expandedResults, setExpandedResults] = useState<Set<number>>(new Set());
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);
  const [isEditingConfig, setIsEditingConfig] = useState(false);

  // Debounced input handlers
  const debouncedSetCustomRequestCount = useCallback(
    debounce((value: number) => setCustomRequestCount(value), 300),
    []
  );

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(() => {
      if (!isRateLimited && !isEditingConfig) fetchStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, [isRateLimited, isEditingConfig]);

  // Real-time countdown for reset timers
  useEffect(() => {
    if (!status) return;
    
    const countdownInterval = setInterval(() => {
      setStatus(prevStatus => {
        if (!prevStatus) return prevStatus;
        
        const now = Math.floor(Date.now() / 1000);
        return {
          ...prevStatus,
          windows: {
            minute: {
              ...prevStatus.windows.minute,
              resetIn: Math.max(0, prevStatus.windows.minute.resetTime - now)
            },
            hour: {
              ...prevStatus.windows.hour,
              resetIn: Math.max(0, prevStatus.windows.hour.resetTime - now)
            },
            day: {
              ...prevStatus.windows.day,
              resetIn: Math.max(0, prevStatus.windows.day.resetTime - now)
            }
          }
        };
      });
    }, 1000); // Update every second
    
    return () => clearInterval(countdownInterval);
  }, [status]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isAutoTesting && !isRateLimited) {
      interval = setInterval(() => {
        sendTestRequest();
      }, testInterval);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAutoTesting, testInterval, isRateLimited]);

  useEffect(() => {
    if (isRateLimited && retryAfter > 0) {
      const timer = setTimeout(() => {
        setIsRateLimited(false);
        setRetryAfter(0);
        fetchStatus();
      }, retryAfter * 1000);
      return () => clearTimeout(timer);
    }
  }, [isRateLimited, retryAfter]);

  // Reset rate limit state on page load
  useEffect(() => {
    setIsRateLimited(false);
    setRetryAfter(0);
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/admin/test', {
        method: 'GET',
        headers: {},
      });

      if (res.status === 429) {
        const retryAfterHeader = res.headers.get('retry-after');
        setIsRateLimited(true);
        setRetryAfter(retryAfterHeader ? parseInt(retryAfterHeader, 10) : 60);
        showToast('error', `Rate limit exceeded. Try again in ${retryAfterHeader || 60}s`);
        return;
      }

      const data = await res.json();
      if (data.success) {
        setStatus(data);
        // Only update config if user is not actively editing
        if (!isEditingConfig) {
          const uiConfig: RateLimitConfig = {
            global: {
              defaultPerMinute: data.config.limits.minute,
              defaultPerHour: data.config.limits.hour,
              defaultPerDay: data.config.limits.day,
            },
          };
          setConfig(uiConfig);
          setOriginalConfig(JSON.parse(JSON.stringify(uiConfig)));
        }
      }
    } catch (error) {
      console.error('Failed to fetch status:', error);
      showToast('error', 'Failed to fetch status');
    }
  };

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const saveConfig = async () => {
    if (!config) return;

    setSaving(true);
    try {
      const payload = {
        global: config.global,
      };
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setOriginalConfig(JSON.parse(JSON.stringify(config)));
        setIsEditingConfig(false);
        showToast('success', 'Configuration saved successfully');
        setTimeout(fetchStatus, 500);
      } else {
        showToast('error', 'Failed to save configuration');
      }
    } catch (error) {
      console.error('Failed to save config:', error);
      showToast('error', 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const resetConfig = () => {
    if (originalConfig) {
      setConfig(JSON.parse(JSON.stringify(originalConfig)));
      setIsEditingConfig(false);
      showToast('success', 'Configuration reset to last saved state');
    }
  };

  const updateGlobalConfig = (field: keyof RateLimitConfig['global'], value: number) => {
    if (!config) return;
    setIsEditingConfig(true);
    setConfig({
      ...config,
      global: {
        ...config.global,
        [field]: value,
      },
    });
  };

  const sendTestRequest = async (customHeaders: Record<string, string> = {}) => {
    if (loading || isRateLimited) return;

    setLoading(true);
    try {
      const currentJWT = getCurrentJWT();
      const currentCookie = getCurrentCookie();

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...customHeaders,
      };

      if (currentJWT && !customHeaders.Authorization) {
        headers['Authorization'] = `Bearer ${currentJWT}`;
      }
      if (currentCookie && !customHeaders.Cookie) {
        headers['Cookie'] = currentCookie;
      }

      const res = await fetch('/api/admin/test', {
        method: 'POST',
        headers,
      });

      if (res.status === 429) {
        const retryAfterHeader = res.headers.get('retry-after');
        setIsRateLimited(true);
        setRetryAfter(retryAfterHeader ? parseInt(retryAfterHeader, 10) : 60);
        showToast('error', `Rate limit exceeded. Try again in ${retryAfterHeader || 60}s`);
      }

      const data = await res.json();

      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        if (key.toLowerCase().startsWith('x-ratelimit') || key === 'retry-after') {
          responseHeaders[key] = value;
        }
      });

      const identityType = data.rateLimit?.identityType || data.details?.identityType || 'unknown';
      const identityKey = data.rateLimit?.identityKey || data.details?.identityKey || 'unknown';

      const result: TestResult = {
        success: data.success,
        message: data.message,
        timestamp: new Date().toISOString(),
        rateLimit: data.rateLimit,
        details: data.details,
        error: data.error,
        identityType,
        identityKey,
        headers: responseHeaders,
        fullResponse: data,
      };

      setTestResults((prev) => [result, ...prev.slice(0, 19)]);
      showToast(data.success ? 'success' : 'error', data.success ? `Request successful - ${identityType}` : data.message);
      setTimeout(fetchStatus, 100);
    } catch (error) {
      console.error('Test request failed:', error);
      const errorResult: TestResult = {
        success: false,
        message: 'Network error',
        timestamp: new Date().toISOString(),
        error: 'Failed to send request',
        identityType: 'unknown',
        identityKey: 'unknown',
      };
      setTestResults((prev) => [errorResult, ...prev.slice(0, 19)]);
      showToast('error', 'Network error - Failed to send request');
    } finally {
      setLoading(false);
    }
  };

  const sendCustomRequests = async () => {
    if (isCustomTesting || isRateLimited) return;

    setIsCustomTesting(true);
    const headers: Record<string, string> = {};

    if (customCookie.trim()) {
      if (!customCookie.match(/^sessionId=[a-zA-Z0-9-]+$/)) {
        showToast('error', 'Invalid cookie format. Use sessionId=<value>');
        setIsCustomTesting(false);
        return;
      }
      headers['Cookie'] = customCookie.trim();
    }

    if (customJWT.trim()) {
      if (!customJWT.match(/^eyJ[a-zA-Z0-9-_]+\.eyJ[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+$/)) {
        showToast('error', 'Invalid JWT format');
        setIsCustomTesting(false);
        return;
      }
      headers['Authorization'] = `Bearer ${customJWT.trim()}`;
    }

    for (let i = 0; i < customRequestCount; i++) {
      await sendTestRequest(headers);
      if (i < customRequestCount - 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    setIsCustomTesting(false);
  };

  const clearResults = () => {
    setTestResults([]);
  };

  const setSessionCookie = (cookieValue: string) => {
    if (cookieValue.match(/^sessionId=[a-zA-Z0-9-]+$/)) {
      document.cookie = `${cookieValue}; path=/`;
      setCurrentCookie(cookieValue);
      showToast('success', 'Session cookie set');
    } else {
      showToast('error', 'Invalid cookie format. Use sessionId=<value>');
    }
  };

  const removeSessionCookie = () => {
    document.cookie = 'sessionId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    setCurrentCookie('');
    showToast('success', 'Session cookie removed');
  };

  const setJWTToken = (token: string) => {
    if (token.match(/^eyJ[a-zA-Z0-9-_]+\.eyJ[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+$/)) {
      localStorage.setItem('demo_jwt_token', token);
      setCurrentJWT(token);
      showToast('success', 'JWT token set');
    } else {
      showToast('error', 'Invalid JWT format');
    }
  };

  const removeJWTToken = () => {
    localStorage.removeItem('demo_jwt_token');
    setCurrentJWT('');
    showToast('success', 'JWT token removed');
  };

  const getCurrentJWT = () => {
    return localStorage.getItem('demo_jwt_token') || '';
  };

  const getCurrentCookie = () => {
    const cookies = document.cookie.split(';');
    const sessionCookie = cookies.find((cookie) => cookie.trim().startsWith('sessionId='));
    return sessionCookie ? sessionCookie.trim() : '';
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('info', 'Copied to clipboard');
    } catch (error) {
      console.error('Failed to copy:', error);
      showToast('error', 'Failed to copy to clipboard');
    }
  };

  const toggleExpandedResult = (index: number) => {
    setExpandedResults((prev) => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(index)) {
        newExpanded.delete(index);
      } else {
        newExpanded.add(index);
      }
      return newExpanded;
    });
  };

  const getIdentityIcon = (type: string) => {
    switch (type) {
      case 'jwt':
        return <Key className="h-4 w-4 text-blue-500" />;
      case 'session':
        return <Cookie className="h-4 w-4 text-green-500" />;
      case 'ip':
        return <Globe className="h-4 w-4 text-orange-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const formatTime = (seconds: number) => {
    if (seconds <= 0) return 'Resetting...';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const getProgressPercentage = (current: number, limit: number) => {
    return Math.min(100, (current / limit) * 100);
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 100) return 'bg-red-500';
    if (percentage >= 80) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const hasChanges = config && originalConfig && JSON.stringify(config) !== JSON.stringify(originalConfig);

  return (
    <div className="container mx-auto p-4 space-y-4">
      {/* Toast Notifications */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 animate-slide-in">
          <div
            className={`flex items-center px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
              toast.type === 'success'
                ? 'bg-green-100 text-green-800 border border-green-200'
                : toast.type === 'error'
                ? 'bg-red-100 text-red-800 border border-red-200'
                : 'bg-blue-100 text-blue-800 border border-blue-200'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle className="h-4 w-4 mr-2" />
            ) : toast.type === 'error' ? (
              <AlertCircle className="h-4 w-4 mr-2" />
            ) : (
              <Activity className="h-4 w-4 mr-2" />
            )}
            {toast.message}
          </div>
        </div>
      )}

      {/* Rate Limit Warning */}
      {isRateLimited && (
        <div className="bg-red-100 border-l-4 border-red-500 p-4 rounded-lg">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
            <p className="text-sm text-red-800">
              Rate limit exceeded. Please wait {formatTime(retryAfter)} before trying again.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Rate Limiting Demo</h1>
        <p className="mt-1 text-sm text-gray-600">
          Test and monitor rate limits with real-time feedback and identity management.
        </p>
      </div>

      {/* Current Status */}
      {status && !isRateLimited && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(['minute', 'hour', 'day'] as WindowType[]).map((window) => (
            <div key={window} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-semibold text-gray-900 capitalize">Per {window}</h3>
                {window === 'minute' ? (
                  <Clock className="h-4 w-4 text-gray-400" />
                ) : window === 'hour' ? (
                  <Activity className="h-4 w-4 text-gray-400" />
                ) : (
                  <Zap className="h-4 w-4 text-gray-400" />
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-gray-900">
                    {status.windows[window].current}/{status.windows[window].limit}
                  </span>
                  <span className="text-xs text-gray-500">
                    Reset in {formatTime(status.windows[window].resetIn)}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(
                      getProgressPercentage(status.windows[window].current, status.windows[window].limit)
                    )}`}
                    style={{
                      width: `${getProgressPercentage(status.windows[window].current, status.windows[window].limit)}%`,
                    }}
                  ></div>
                </div>
                <div className="text-xs text-gray-600">
                  {status.windows[window].remaining} requests remaining
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Test Controls and Config */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Request Tester */}
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 mb-2">Request Tester</h3>
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => sendTestRequest()}
                disabled={loading || isRateLimited}
                className="inline-flex items-center px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Send Request
              </button>
              <button
                onClick={() => setIsAutoTesting(!isAutoTesting)}
                disabled={isRateLimited}
                className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  isAutoTesting
                    ? 'bg-red-50 border border-red-300 text-red-700 hover:bg-red-100'
                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {isAutoTesting ? (
                  <>
                    <Pause className="h-4 w-4 mr-2" />
                    Stop Auto
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Start Auto
                  </>
                )}
              </button>
              <button
                onClick={clearResults}
                className="inline-flex items-center px-2.5 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Clear
              </button>
            </div>
            {isAutoTesting && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Auto-test Interval (ms)
                </label>
                <input
                  type="number"
                  min="100"
                  max="10000"
                  step="100"
                  value={testInterval}
                  onChange={(e) => setTestInterval(Number(e.target.value))}
                  className="w-32 border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Sends a request every {testInterval}ms
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Rate Limit Configuration */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="text-base font-medium text-gray-900 flex items-center">
              <Settings className="h-4 w-4 mr-2" />
              Global Rate Limits
            </h3>
            <p className="mt-1 text-xs text-gray-500">Default rate limits applied to all endpoints</p>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(['defaultPerMinute', 'defaultPerHour', 'defaultPerDay'] as (keyof RateLimitConfig['global'])[]).map((field) => (
                <div key={field}>
                  <label className="block text-xs font-medium text-gray-700 mb-1 capitalize">
                    <Clock className="inline h-3 w-3 mr-1" />
                    Per {field.replace('defaultPer', '').toLowerCase()}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={config?.global[field] || 0}
                    onChange={(e) => updateGlobalConfig(field, Number.parseInt(e.target.value))}
                    className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end space-x-3 mt-4">
              <button
                onClick={resetConfig}
                disabled={!hasChanges}
                className="inline-flex items-center px-2.5 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset
              </button>
              <button
                onClick={saveConfig}
                disabled={saving || !hasChanges}
                className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                <Save className={`h-3 w-3 mr-1 ${saving ? 'animate-spin' : ''}`} />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Identity Management */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900 mb-2">Identity Management</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-800">Session Cookie</h4>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                placeholder="sessionId=demo123"
                value={customCookie}
                onChange={(e) => setCustomCookie(e.target.value)}
                className="flex-1 border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                onClick={() => setSessionCookie(customCookie)}
                disabled={!customCookie.trim()}
                className="px-2.5 py-1.5 bg-green-600 text-white text-xs font-medium rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 transition-colors"
              >
                Set Cookie
              </button>
            </div>
            {currentCookie && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600 truncate">
                  Current: {currentCookie}
                </span>
                <button
                  onClick={removeSessionCookie}
                  className="px-2.5 py-1 bg-red-100 text-red-700 text-xs font-medium rounded hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-800">JWT Token</h4>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={customJWT}
                onChange={(e) => setCustomJWT(e.target.value)}
                className="flex-1 border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
              />
              <button
                onClick={() => setJWTToken(customJWT)}
                disabled={!customJWT.trim()}
                className="px-2.5 py-1.5 bg-green-600 text-white text-xs font-medium rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 transition-colors"
              >
                Set JWT
              </button>
            </div>
            {currentJWT && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600 truncate">
                  Current: {currentJWT.substring(0, 20)}...
                </span>
                <button
                  onClick={removeJWTToken}
                  className="px-2.5 py-1 bg-red-100 text-red-700 text-xs font-medium rounded hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-gray-800">Quick Test</h4>
              <p className="text-xs text-gray-600">Test with current identity settings</p>
            </div>
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-2">
                <label className="text-xs text-gray-700">Requests:</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={customRequestCount}
                  onChange={(e) => debouncedSetCustomRequestCount(Number(e.target.value))}
                  className="w-20 border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <button
                onClick={sendCustomRequests}
                disabled={isCustomTesting || loading || isRateLimited}
                className="inline-flex items-center px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 transition-colors"
              >
                {isCustomTesting ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Zap className="h-3 w-3 mr-1" />
                )}
                {isCustomTesting ? 'Testing...' : `Send ${customRequestCount} Requests`}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Identity Info */}
      {status && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-900 mb-2">Current Identity</h4>
          <div className="flex items-center space-x-2">
            {getIdentityIcon(status.identity.type)}
            <span className="font-mono text-sm text-blue-800">{status.identity.key}</span>
            <span className="px-2 py-1 bg-blue-100 rounded text-xs text-blue-800">
              {status.identity.type}
            </span>
          </div>
          <p className="mt-2 text-xs text-blue-600">
            Rate limits are applied per identity. Set a session cookie or JWT token to test different identities.
          </p>
        </div>
      )}

      {/* Test Results */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
        <div className="px-3 py-2 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900">Test Results</h3>
            <div className="text-xs text-gray-500">{testResults.length} requests</div>
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {testResults.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              <Activity className="h-6 w-6 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No test requests yet. Click &quot;Send Request&quot; to start testing.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {testResults.map((result, i) => (
                <div key={i} className="p-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start space-x-2">
                    <div className="flex-shrink-0 mt-1">
                      {result.success ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-red-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <p className={`text-xs font-medium ${result.success ? 'text-green-800' : 'text-red-800'}`}>
                            {result.message}
                          </p>
                          {result.identityType && (
                            <div className="flex items-center space-x-1 text-xs text-gray-500">
                              {getIdentityIcon(result.identityType)}
                              <span className="capitalize text-xs">{result.identityType}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-gray-500">
                            {new Date(result.timestamp).toLocaleTimeString()}
                          </span>
                          <button
                            onClick={() => toggleExpandedResult(i)}
                            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            {expandedResults.has(i) ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                      {result.rateLimit && (
                        <div className="mt-2 text-xs text-gray-600">
                          <span className="font-mono">{result.rateLimit.remaining} remaining</span>
                          <span className="mx-2">•</span>
                          <span>Reset in {formatTime(result.rateLimit.resetIn)}</span>
                        </div>
                      )}
                      {result.details && (
                        <div className="mt-2 text-xs text-gray-600">
                          <span>Retry after {result.details.retryAfter}s</span>
                          <span className="mx-2">•</span>
                          <span>Processing: {result.details.processingTime}ms</span>
                        </div>
                      )}
                      {expandedResults.has(i) && (
                        <div className="mt-4 space-y-3 bg-gray-50 rounded-lg p-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="bg-white rounded-lg p-3 border border-gray-200">
                              <h4 className="text-xs font-semibold text-gray-700 mb-2">Identity Details</h4>
                              <div className="space-y-1 text-xs text-gray-600">
                                <div className="flex items-center justify-between">
                                  <span className="font-medium">Type:</span>
                                  <span className="capitalize">{result.identityType}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="font-medium">Key:</span>
                                  <span className="font-mono truncate">{result.identityKey}</span>
                                </div>
                              </div>
                            </div>
                            {result.headers && Object.keys(result.headers).length > 0 && (
                              <div className="bg-white rounded-lg p-3 border border-gray-200">
                                <h4 className="text-xs font-semibold text-gray-700 mb-2">Rate Limit Headers</h4>
                                <div className="space-y-1 text-xs text-gray-600">
                                  {Object.entries(result.headers).map(([key, value]) => (
                                    <div key={key} className="flex items-center justify-between">
                                      <span className="font-mono text-blue-700">{key}:</span>
                                      <span className="font-mono text-blue-600">{value}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="bg-white rounded-lg p-3 border border-gray-200">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="text-xs font-semibold text-gray-700">Full Response</h4>
                              <button
                                onClick={() => copyToClipboard(JSON.stringify(result.fullResponse, null, 2))}
                                className="flex items-center space-x-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                              >
                                <Copy className="h-3 w-3" />
                                <span>Copy JSON</span>
                              </button>
                            </div>
                            <pre className="text-xs text-gray-600 bg-gray-50 rounded border p-2 overflow-x-auto max-h-48">
                              {JSON.stringify(result.fullResponse, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
