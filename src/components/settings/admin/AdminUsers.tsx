'use client';

import React, { useState, useEffect } from 'react';
import { Search, Filter, RefreshCw, Download, RotateCcw, AlertCircle, CheckCircle, Clock, User, Globe, Key } from 'lucide-react';

interface UserRateLimitStatus {
  identityKey: string;
  identityType: 'jwt' | 'session' | 'ip';
  windows: {
    perMinute: { current: number; limit: number; resetTime: number };
    perHour: { current: number; limit: number; resetTime: number };
    perDay: { current: number; limit: number; resetTime: number };
  };
  lastActivity: string;
  isBlocked: boolean;
  totalRequests?: number;
}

interface SearchFilters {
  identityKey: string;
  identityType: 'all' | 'jwt' | 'session' | 'ip';
  status: 'all' | 'active' | 'blocked' | 'exceeded';
  sortBy: 'usage' | 'lastActivity' | 'resetTime';
  sortOrder: 'asc' | 'desc';
}

export function AdminUsers() {
  const [users, setUsers] = useState<UserRateLimitStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<SearchFilters>({
    identityKey: '',
    identityType: 'all',
    status: 'all',
    sortBy: 'lastActivity',
    sortOrder: 'desc'
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [resetting, setResetting] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, [filters, currentPage]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        identityKey: filters.identityKey,
        identityType: filters.identityType,
        status: filters.status,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
        page: String(currentPage),
        limit: '20'
      });
      const res = await fetch(`/api/admin/users?${params}`, {
        headers: {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setUsers(json.data || []);
      setTotalPages(json.pagination?.totalPages || 1);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      setLoading(false);
    }
  };

  const resetUserLimits = async (identityKey: string) => {
    setResetting(identityKey);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(identityKey)}/reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ confirm: true, window: 'minute' })
      });
      fetchUsers();
    } catch (error) {
      console.error('Failed to reset user limits:', error);
    } finally {
      setResetting(null);
    }
  };

  const getStatusColor = (user: UserRateLimitStatus) => {
    if (user.isBlocked) return 'text-red-600 bg-red-50';
    
    const minuteUsage = (user.windows.perMinute.current / user.windows.perMinute.limit) * 100;
    if (minuteUsage > 90) return 'text-yellow-600 bg-yellow-50';
    
    return 'text-green-600 bg-green-50';
  };

  const getStatusIcon = (user: UserRateLimitStatus) => {
    if (user.isBlocked) return <AlertCircle className="h-4 w-4" />;
    
    const minuteUsage = (user.windows.perMinute.current / user.windows.perMinute.limit) * 100;
    if (minuteUsage > 90) return <Clock className="h-4 w-4" />;
    
    return <CheckCircle className="h-4 w-4" />;
  };

  const getIdentityIcon = (type: string) => {
    switch (type) {
      case 'jwt': return <User className="h-4 w-4" />;
      case 'session': return <Key className="h-4 w-4" />;
      case 'ip': return <Globe className="h-4 w-4" />;
      default: return <User className="h-4 w-4" />;
    }
  };

  const formatTimeRemaining = (resetTime: number) => {
    const remaining = Math.max(0, resetTime - Date.now());
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">User Management</h1>
          <p className="mt-2 text-base text-muted-foreground">
            Monitor and manage rate limits for individual users
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="inline-flex items-center px-4 py-2.5 border border-border shadow-sm text-sm font-medium rounded-lg text-foreground bg-background hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          
          <button className="inline-flex items-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-lg shadow-sm text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring transition-colors">
            <Download className="h-4 w-4 mr-2" />
            Export
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-3">
              Search Identity
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by identity key..."
                className="pl-10 w-full border-input rounded-lg shadow-sm focus:ring-ring focus:border-ring bg-background text-foreground py-2.5"
                value={filters.identityKey}
                onChange={(e) => setFilters({ ...filters, identityKey: e.target.value })}
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-foreground mb-3">
              Identity Type
            </label>
            <select
              className="w-full border-input rounded-lg shadow-sm focus:ring-ring focus:border-ring bg-background text-foreground py-2.5"
              value={filters.identityType}
              onChange={(e) => setFilters({ ...filters, identityType: e.target.value as any })}
            >
              <option value="all">All Types</option>
              <option value="jwt">JWT Users</option>
              <option value="session">Session Users</option>
              <option value="ip">IP Addresses</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-foreground mb-3">
              Status
            </label>
            <select
              className="w-full border-input rounded-lg shadow-sm focus:ring-ring focus:border-ring bg-background text-foreground py-2.5"
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value as any })}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="blocked">Blocked</option>
              <option value="exceeded">Limit Exceeded</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground uppercase tracking-wider">
                  Identity
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground uppercase tracking-wider">
                  Usage (Min/Hr/Day)
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground uppercase tracking-wider">
                  Reset Time
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-muted animate-pulse rounded-lg mr-4"></div>
                        <div className="h-4 bg-muted animate-pulse rounded w-32"></div>
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="h-6 bg-muted animate-pulse rounded-full w-20"></div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="h-4 bg-muted animate-pulse rounded w-24"></div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="h-4 bg-muted animate-pulse rounded w-16"></div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="h-4 bg-muted animate-pulse rounded w-20"></div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="h-8 bg-muted animate-pulse rounded-lg w-16"></div>
                    </td>
                  </tr>
                ))
              ) : (
                users.map((user) => (
                  <tr key={user.identityKey} className="hover:bg-accent transition-colors">
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                            {getIdentityIcon(user.identityType)}
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-semibold text-foreground max-w-xs truncate">
                            {user.identityKey}
                          </div>
                          <div className="text-sm text-muted-foreground capitalize">
                            {user.identityType}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(user)}`}>
                        {getStatusIcon(user)}
                        <span className="ml-2">
                          {user.isBlocked ? 'Blocked' : 'Active'}
                        </span>
                      </span>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-sm text-foreground">
                      <div className="space-y-2">
                        <div className="flex items-center space-x-3">
                          <span className="w-12 text-xs font-medium text-muted-foreground">Min:</span>
                          <div className="flex-1 bg-muted rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                (user.windows.perMinute.current / user.windows.perMinute.limit) > 0.9 
                                  ? 'bg-red-500' 
                                  : (user.windows.perMinute.current / user.windows.perMinute.limit) > 0.7 
                                  ? 'bg-yellow-500' 
                                  : 'bg-green-500'
                              }`}
                              style={{ 
                                width: `${Math.min(100, (user.windows.perMinute.current / user.windows.perMinute.limit) * 100)}%` 
                              }}
                            ></div>
                          </div>
                          <span className="text-xs font-medium text-foreground min-w-0">
                            {user.windows.perMinute.current}/{user.windows.perMinute.limit}
                          </span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <span className="w-12 text-xs font-medium text-muted-foreground">Hr:</span>
                          <div className="flex-1 bg-muted rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                (user.windows.perHour.current / user.windows.perHour.limit) > 0.9 
                                  ? 'bg-red-500' 
                                  : (user.windows.perHour.current / user.windows.perHour.limit) > 0.7 
                                  ? 'bg-yellow-500' 
                                  : 'bg-green-500'
                              }`}
                              style={{ 
                                width: `${Math.min(100, (user.windows.perHour.current / user.windows.perHour.limit) * 100)}%` 
                              }}
                            ></div>
                          </div>
                          <span className="text-xs font-medium text-foreground min-w-0">
                            {user.windows.perHour.current}/{user.windows.perHour.limit}
                          </span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <span className="w-12 text-xs font-medium text-muted-foreground">Day:</span>
                          <div className="flex-1 bg-muted rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                (user.windows.perDay.current / user.windows.perDay.limit) > 0.9 
                                  ? 'bg-red-500' 
                                  : (user.windows.perDay.current / user.windows.perDay.limit) > 0.7 
                                  ? 'bg-yellow-500' 
                                  : 'bg-green-500'
                              }`}
                              style={{ 
                                width: `${Math.min(100, (user.windows.perDay.current / user.windows.perDay.limit) * 100)}%` 
                              }}
                            ></div>
                          </div>
                          <span className="text-xs font-medium text-foreground min-w-0">
                            {user.windows.perDay.current}/{user.windows.perDay.limit}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-sm font-medium text-foreground">
                      {formatTimeRemaining(user.windows.perMinute.resetTime)}
                    </td>
                    {/* <td className="px-6 py-5 whitespace-nowrap text-sm text-gray-600">
                      {new Date(user.lastActivity).toLocaleString()}
                    </td> */}
                    <td className="px-6 py-5 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => resetUserLimits(user.identityKey)}
                        disabled={resetting === user.identityKey}
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-lg text-primary bg-primary/10 hover:bg-primary/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring disabled:opacity-50 transition-colors"
                      >
                        <RotateCcw className={`h-3 w-3 mr-1 ${resetting === user.identityKey ? 'animate-spin' : ''}`} />
                        Reset
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="bg-card px-6 py-4 flex items-center justify-between border-t border-border">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(currentPage - 1)}
              className="relative inline-flex items-center px-4 py-2 border border-border text-sm font-medium rounded-lg text-foreground bg-background hover:bg-accent disabled:opacity-50 transition-colors"
            >
              Previous
            </button>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(currentPage + 1)}
              className="ml-3 relative inline-flex items-center px-4 py-2 border border-border text-sm font-medium rounded-lg text-foreground bg-background hover:bg-accent disabled:opacity-50 transition-colors"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Showing page <span className="font-semibold">{currentPage}</span> of{' '}
                <span className="font-semibold">{totalPages}</span>
              </p>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-lg shadow-sm -space-x-px">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(currentPage - 1)}
                  className="relative inline-flex items-center px-4 py-2 rounded-l-lg border border-border bg-background text-sm font-medium text-muted-foreground hover:bg-accent disabled:opacity-50 transition-colors"
                >
                  Previous
                </button>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(currentPage + 1)}
                  className="relative inline-flex items-center px-4 py-2 rounded-r-lg border border-border bg-background text-sm font-medium text-muted-foreground hover:bg-accent disabled:opacity-50 transition-colors"
                >
                  Next
                </button>
              </nav>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
