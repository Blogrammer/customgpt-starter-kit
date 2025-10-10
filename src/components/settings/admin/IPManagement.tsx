/**
 * IP Management Component
 * 
 * UI for blocking IPs and setting custom rate limits
 */

import React, { useState, useEffect } from 'react';
import {
  Shield,
  Ban,
  Plus,
  Trash2,
  Clock,
  AlertCircle,
  CheckCircle,
  Edit,
  Save,
  X,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface IPConfig {
  ip: string;
  type: 'block' | 'custom_limit';
  customLimits?: {
    queriesPerMinute?: number;
    queriesPerHour?: number;
    queriesPerDay?: number;
  };
  reason?: string;
  expiresAt?: string;
  createdAt: string;
  createdBy?: string;
}

export function IPManagement() {
  const [ipConfigs, setIpConfigs] = useState<IPConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState<Partial<IPConfig>>({
    type: 'block'
  });

  // Fetch IP configurations
  const fetchIPConfigs = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/ip-management');
      const data = await response.json();

      if (data.success) {
        setIpConfigs(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch IP configs:', error);
      toast.error('Failed to load IP configurations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIPConfigs();
  }, []);

  // Add new IP configuration
  const handleAdd = async () => {
    if (!formData.ip) {
      toast.error('IP address is required');
      return;
    }

    // Validate IP format
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipRegex.test(formData.ip)) {
      toast.error('Invalid IP address format');
      return;
    }

    if (formData.type === 'custom_limit' && !formData.customLimits) {
      toast.error('Custom limits are required when type is custom_limit');
      return;
    }

    try {
      const response = await fetch('/api/admin/ip-management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`IP ${formData.ip} ${formData.type === 'block' ? 'blocked' : 'configured'}`);
        setShowAddForm(false);
        setFormData({ type: 'block' });
        fetchIPConfigs();
      } else {
        toast.error(data.error || 'Failed to add IP configuration');
      }
    } catch (error) {
      console.error('Failed to add IP config:', error);
      toast.error('Failed to add IP configuration');
    }
  };

  // Remove IP configuration
  const handleRemove = async (ip: string) => {
    if (!confirm(`Remove configuration for IP ${ip}?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/ip-management?ip=${encodeURIComponent(ip)}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`Configuration for ${ip} removed`);
        fetchIPConfigs();
      } else {
        toast.error(data.error || 'Failed to remove configuration');
      }
    } catch (error) {
      console.error('Failed to remove IP config:', error);
      toast.error('Failed to remove configuration');
    }
  };

  // Format expiry date
  const formatExpiry = (expiresAt?: string) => {
    if (!expiresAt) return 'Permanent';
    const date = new Date(expiresAt);
    const now = new Date();
    if (date < now) return 'Expired';
    
    const hours = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60));
    if (hours < 24) return `${hours}h remaining`;
    
    const days = Math.floor(hours / 24);
    return `${days}d remaining`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-6 bg-card border-border">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <Ban className="w-5 h-5 text-primary" />
              IP Management
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Block IPs or set custom rate limits
            </p>
          </div>
          <Button
            onClick={() => setShowAddForm(true)}
            disabled={showAddForm}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add IP Rule
          </Button>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <div className="mb-6 p-4 bg-accent/10 border border-primary/20 rounded-lg">
            <h3 className="font-medium text-foreground mb-4">Add IP Configuration</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  IP Address *
                </label>
                <input
                  type="text"
                  value={formData.ip || ''}
                  onChange={(e) => setFormData({ ...formData, ip: e.target.value })}
                  placeholder="192.168.1.1"
                  className="w-full px-3 py-2 bg-background border border-border rounded text-foreground"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Type *
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    type: e.target.value as 'block' | 'custom_limit',
                    customLimits: e.target.value === 'block' ? undefined : {}
                  })}
                  className="w-full px-3 py-2 bg-background border border-border rounded text-foreground"
                >
                  <option value="block">Block IP</option>
                  <option value="custom_limit">Custom Rate Limit</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Reason
                </label>
                <input
                  type="text"
                  value={formData.reason || ''}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="Abuse detected"
                  className="w-full px-3 py-2 bg-background border border-border rounded text-foreground"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Expires At
                </label>
                <input
                  type="datetime-local"
                  value={formData.expiresAt ? formData.expiresAt.slice(0, 16) : ''}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    expiresAt: e.target.value ? new Date(e.target.value).toISOString() : undefined 
                  })}
                  className="w-full px-3 py-2 bg-background border border-border rounded text-foreground"
                />
              </div>
            </div>

            {/* Custom Limits (only show if type is custom_limit) */}
            {formData.type === 'custom_limit' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Queries Per Minute
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.customLimits?.queriesPerMinute || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      customLimits: {
                        ...formData.customLimits,
                        queriesPerMinute: e.target.value ? parseInt(e.target.value) : undefined
                      }
                    })}
                    placeholder="No limit"
                    className="w-full px-3 py-2 bg-background border border-border rounded text-foreground"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Queries Per Hour
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.customLimits?.queriesPerHour || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      customLimits: {
                        ...formData.customLimits,
                        queriesPerHour: e.target.value ? parseInt(e.target.value) : undefined
                      }
                    })}
                    placeholder="No limit"
                    className="w-full px-3 py-2 bg-background border border-border rounded text-foreground"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Queries Per Day
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.customLimits?.queriesPerDay || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      customLimits: {
                        ...formData.customLimits,
                        queriesPerDay: e.target.value ? parseInt(e.target.value) : undefined
                      }
                    })}
                    placeholder="No limit"
                    className="w-full px-3 py-2 bg-background border border-border rounded text-foreground"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddForm(false);
                  setFormData({ type: 'block' });
                }}
              >
                <X className="w-4 h-4 mr-1" />
                Cancel
              </Button>
              <Button onClick={handleAdd}>
                <Save className="w-4 h-4 mr-1" />
                Save Configuration
              </Button>
            </div>
          </div>
        )}

        {/* IP List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : ipConfigs.length === 0 ? (
          <div className="text-center py-12">
            <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No IP configurations found</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add IP rules to block or limit specific addresses
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {ipConfigs.map((config) => (
              <div
                key={config.ip}
                className={cn(
                  "p-4 rounded-lg border",
                  config.type === 'block' 
                    ? "bg-destructive/5 border-destructive/20" 
                    : "bg-warning/5 border-warning/20"
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-medium text-foreground">
                        {config.ip}
                      </span>
                      <span className={cn(
                        "px-2 py-0.5 text-xs rounded-full",
                        config.type === 'block'
                          ? "bg-destructive/10 text-destructive"
                          : "bg-warning/10 text-warning"
                      )}>
                        {config.type === 'block' ? 'Blocked' : 'Custom Limit'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatExpiry(config.expiresAt)}
                      </span>
                    </div>

                    {config.reason && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Reason: {config.reason}
                      </p>
                    )}

                    {config.customLimits && (
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        {config.customLimits.queriesPerMinute && (
                          <span>{config.customLimits.queriesPerMinute}/min</span>
                        )}
                        {config.customLimits.queriesPerHour && (
                          <span>{config.customLimits.queriesPerHour}/hour</span>
                        )}
                        {config.customLimits.queriesPerDay && (
                          <span>{config.customLimits.queriesPerDay}/day</span>
                        )}
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground mt-2">
                      Added {new Date(config.createdAt).toLocaleString()}
                      {config.createdBy && ` by ${config.createdBy}`}
                    </p>
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemove(config.ip)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Info Box */}
      <Card className="p-4 bg-primary/5 border-primary/20">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-primary mt-0.5" />
          <div className="text-sm text-foreground">
            <p className="font-medium mb-1">IP Management Guidelines</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>• Blocked IPs cannot access any endpoints</li>
              <li>• Custom limits override default rate limits for specific IPs</li>
              <li>• Temporary blocks automatically expire at the specified time</li>
              <li>• IP configurations take effect immediately</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
