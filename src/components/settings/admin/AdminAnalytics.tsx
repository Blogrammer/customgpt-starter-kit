'use client';

import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Users, Activity, Download, Calendar, Filter, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
import { MetricsCard, MetricsGrid } from '@/components/admin/MetricsCard';

interface AnalyticsData {
  overview: {
    totalRequests: number;
    blockedRequests: number;
    uniqueUsers: number;
    averageResponseTime: number;
  };
  trends: {
    timestamp: string;
    requests: number;
    blocked: number;
    users: number;
  }[];
  topUsers: {
    identityKey: string;
    identityType: string;
    requests: number;
    blocked: number;
    lastActivity: string;
  }[];
  topRoutes: {
    route: string;
    requests: number;
    blocked: number;
    averageResponseTime: number;
  }[];
  hourlyDistribution: {
    hour: number;
    requests: number;
    blocked: number;
  }[];
}

export function AdminAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('24h');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  const fetchAnalytics = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/admin/analytics?range=${timeRange}`, {
        headers: {}
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const a = json.data;
      
      // Use the new data structure from the API
      const out: AnalyticsData = {
        overview: {
          totalRequests: a.requestsPerMinute || 0,
          blockedRequests: a.blockedRequests || 0,
          uniqueUsers: a.totalUsers || 0,
          averageResponseTime: 0,
        },
        trends: a.trends || [],
        topUsers: (a.topUsers || []).map((u: any) => ({
          identityKey: u.identityKey,
          identityType: u.identityType,
          requests: u.requestCount || 0,
          blocked: 0,
          lastActivity: new Date().toISOString(),
        })),
        topRoutes: a.topRoutes || [],
        hourlyDistribution: a.hourlyDistribution || [],
      };
      setData(out);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const exportData = async () => {
    try {
      const res = await fetch(`/api/admin/export?format=csv&timeRange=${timeRange}`, {
        headers: {}
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-${timeRange}.csv`;
      a.click();
    } catch (error) {
      console.error('Failed to export data:', error);
    }
  };

  if (loading && !data) {
    return (
      <div className="space-y-8">
        <div className="h-8 bg-gray-200 animate-pulse rounded w-64"></div>
        <MetricsGrid>
          {[1, 2, 3, 4].map(i => (
            <MetricsCard
              key={i}
              title=""
              value={0}
              icon={Activity}
              loading={true}
            />
          ))}
        </MetricsGrid>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2].map(i => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <div className="h-6 bg-gray-200 animate-pulse rounded w-32 mb-4"></div>
              <div className="h-64 bg-gray-200 animate-pulse rounded-lg"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const blockRate = ((data.overview.blockedRequests / data.overview.totalRequests) * 100).toFixed(2);

  return (
    <div className="space-y-8">
      {/* Modern header with improved typography */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Analytics Dashboard</h1>
          <p className="mt-2 text-base text-gray-600">
            Usage patterns and performance insights
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="border-gray-200 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 py-2.5"
          >
            <option value="1h">Last Hour</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>
          
          <button
            onClick={fetchAnalytics}
            disabled={refreshing}
            className="inline-flex items-center px-4 py-2.5 border border-gray-200 shadow-sm text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Overview Metrics */}
      <MetricsGrid>
        <MetricsCard
          title="Total Requests"
          value={data.overview.totalRequests}
          change={{ value: 12, type: 'increase', period: '' }}
          icon={Activity}
          color="blue"
        />
        <MetricsCard
          title="Blocked Requests"
          value={data.overview.blockedRequests}
          change={{ value: 8, type: 'decrease', period: '' }}
          icon={AlertTriangle}
          color="red"
        />
        <MetricsCard
          title="Unique Users"
          value={data.overview.uniqueUsers}
          change={{ value: 15, type: 'increase', period: '' }}
          icon={Users}
          color="green"
        />
        <MetricsCard
          title="Avg Response Time"
          value={`${data.overview.averageResponseTime}ms`}
          change={{ value: 5, type: 'decrease', period: '' }}
          icon={TrendingUp}
          color="purple"
        />
      </MetricsGrid>

      {/* Request Trends Chart */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Request Trends (Last 12 Hours)</h3>
          <div className="flex items-center space-x-4 text-sm">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-blue-500 rounded-full mr-2"></div>
              <span className="text-gray-600 font-medium">Requests</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
              <span className="text-gray-600 font-medium">Blocked</span>
            </div>
          </div>
        </div>
        
        {/* Simple chart representation */}
        <div className="h-64 flex items-end space-x-1">
          {data.trends.slice(-12).map((point, i) => {
            const maxRequests = Math.max(...data.trends.map(p => p.requests));
            const requestHeight = (point.requests / maxRequests) * 240;
            const blockedHeight = (point.blocked / maxRequests) * 240;
            
            return (
              <div key={i} className="flex-1 flex flex-col items-center">
                <div className="w-full flex flex-col justify-end h-60">
                  <div 
                    className="w-full bg-blue-500 rounded-t"
                    style={{ height: `${requestHeight}px` }}
                    title={`${point.requests} requests`}
                  ></div>
                  <div 
                    className="w-full bg-red-500"
                    style={{ height: `${blockedHeight}px` }}
                    title={`${point.blocked} blocked`}
                  ></div>
                </div>
                <div className="text-xs text-gray-500 mt-2 font-medium">
                  {new Date(point.timestamp).getHours()}:00
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modern tables with better styling */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Routes */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Top Routes by Traffic</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                    Route
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                    Requests
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                    Blocked
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                    Avg Time
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {data.topRoutes.length > 0 ? (
                  data.topRoutes.map((route, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-semibold text-gray-900 font-mono">
                          {route.route}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                        {route.requests.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                          route.blocked > 0 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                        }`}>
                          {route.blocked}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                        {route.averageResponseTime}ms
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                      <div className="flex flex-col items-center">
                        <Activity className="h-8 w-8 text-gray-300 mb-2" />
                        <p>No route data available</p>
                        <p className="text-sm">Routes will appear here as traffic is generated</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
