'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Activity, 
  Shield, 
  RefreshCw,
  TrendingUp
} from 'lucide-react';
import { MetricsCard, MetricsGrid } from '@/components/admin/MetricsCard';

interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  blockedRequests: number;
  requestsPerMinute: number;
}

export function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    fetchStats();
    
    if (autoRefresh) {
      const interval = setInterval(fetchStats, 5000); // Refresh every 5 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/admin/analytics', {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const data = json.data as { totalUsers: number; activeUsers: number; blockedRequests: number; requestsPerMinute: number };
      setStats({
        totalUsers: data.totalUsers || 0,
        activeUsers: data.activeUsers || 0,
        blockedRequests: data.blockedRequests || 0,
        requestsPerMinute: data.requestsPerMinute || 0,
      });
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rate Limiting Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Real-time monitoring of API rate limits and user activity
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
              autoRefresh ? 'bg-green-50 border-green-300 text-green-700' : ''
            }`}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
            Auto Refresh
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <MetricsGrid>
        <MetricsCard
          title="Total Users"
          value={stats?.totalUsers || 0}
          change={{ value: 12, type: 'increase', period: 'vs last hour' }}
          icon={Users}
          color="blue"
          loading={loading}
        />
        <MetricsCard
          title="Active Users"
          value={stats?.activeUsers || 0}
          change={{ value: 8, type: 'increase', period: 'vs last hour' }}
          icon={Activity}
          color="green"
          loading={loading}
        />
        <MetricsCard
          title="Blocked Requests"
          value={stats?.blockedRequests || 0}
          change={{ value: 3, type: 'decrease', period: 'vs last hour' }}
          icon={Shield}
          color="red"
          loading={loading}
        />
        <MetricsCard
          title="Requests / Minute"
          value={stats?.requestsPerMinute ?? 0}
          change={{ value: 0, type: 'increase', period: '' }}
          icon={TrendingUp}
          color="green"
          loading={loading}
        />
      </MetricsGrid>

      {/* System Health */}
      <HealthCards />
    </div>
  );
}

function HealthCards() {
  const [health, setHealth] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/admin/health', {
        headers: {}
      });
      const json = await res.json();
      setHealth(json.data);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchHealth();
    const t = setInterval(fetchHealth, 10000);
    return () => clearInterval(t);
  }, []);

  const pill = (ok: boolean, text: string) => (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
      {text}
    </span>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">System Health</h3>
        {loading ? (
          <div className="h-24 bg-gray-100 animate-pulse rounded" />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Redis Connection</span>
              {pill(!!health?.services?.redis?.connected, !!health?.services?.redis?.connected ? 'Connected' : 'Down')}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Turnstile</span>
              {pill(!!health?.services?.turnstile?.enabled && !!health?.services?.turnstile?.configured, health?.services?.turnstile?.enabled ? 'Enabled' : 'Disabled')}
            </div>
          </div>
        )}
      </div>
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Runtime</h3>
        {loading ? (
          <div className="h-24 bg-gray-100 animate-pulse rounded" />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Environment</span>
              <span className="text-sm font-medium text-gray-900">{health?.environment || 'unknown'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Version</span>
              <span className="text-sm font-medium text-gray-900">{health?.version || '1.0.0'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
