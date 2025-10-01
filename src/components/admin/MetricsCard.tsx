'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricsCardProps {
  title: string;
  value: string | number;
  change?: {
    value: number;
    type: 'increase' | 'decrease';
    period: string;
  };
  icon: LucideIcon;
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'purple';
  loading?: boolean;
}

const colorClasses = {
  blue: {
    bg: 'bg-blue-50',
    icon: 'text-blue-600',
    change: 'text-blue-600'
  },
  green: {
    bg: 'bg-green-50',
    icon: 'text-green-600',
    change: 'text-green-600'
  },
  red: {
    bg: 'bg-red-50',
    icon: 'text-red-600',
    change: 'text-red-600'
  },
  yellow: {
    bg: 'bg-yellow-50',
    icon: 'text-yellow-600',
    change: 'text-yellow-600'
  },
  purple: {
    bg: 'bg-purple-50',
    icon: 'text-purple-600',
    change: 'text-purple-600'
  }
};

export function MetricsCard({ 
  title, 
  value, 
  change, 
  icon: Icon, 
  color = 'blue',
  loading = false 
}: MetricsCardProps) {
  const colors = colorClasses[color];

  if (loading) {
    return (
      <div className="bg-white overflow-hidden shadow rounded-lg">
        <div className="p-5">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className={cn('p-3 rounded-md', colors.bg)}>
                <div className="w-6 h-6 bg-gray-200 animate-pulse rounded"></div>
              </div>
            </div>
            <div className="ml-5 w-0 flex-1">
              <div className="h-4 bg-gray-200 animate-pulse rounded mb-2"></div>
              <div className="h-8 bg-gray-200 animate-pulse rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow">
      <div className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className={cn('p-3 rounded-md', colors.bg)}>
              <Icon className={cn('h-6 w-6', colors.icon)} />
            </div>
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 truncate">
                {title}
              </dt>
              <dd className="flex items-baseline">
                <div className="text-2xl font-semibold text-gray-900">
                  {typeof value === 'number' ? value.toLocaleString() : value}
                </div>
                {change && (
                  <div className={cn(
                    'ml-2 flex items-baseline text-sm font-semibold',
                    change.type === 'increase' ? 'text-green-600' : 'text-red-600'
                  )}>
                    <span className={cn(
                      change.type === 'increase' ? 'text-green-600' : 'text-red-600'
                    )}>
                      {change.type === 'increase' ? '+' : '-'}{Math.abs(change.value)}%
                    </span>
                    <span className="ml-1 text-gray-500 text-xs">
                      {change.period}
                    </span>
                  </div>
                )}
              </dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MetricsGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </div>
  );
}
