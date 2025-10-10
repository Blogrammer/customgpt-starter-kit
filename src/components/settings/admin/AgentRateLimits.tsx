/**
 * Agent-Specific Rate Limiting Configuration
 * 
 * UI for managing per-agent query limits
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Plus,
  Trash2,
  Edit,
  Save,
  X,
  AlertCircle,
  CheckCircle,
  Clock,
  Shield,
  ChevronLeft,
  ChevronRight,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Agent {
  id: string;
  name: string;
  rateLimitConfig: {
    limits: {
      queriesPerMinute?: number;
      queriesPerHour?: number;
      queriesPerDay?: number;
      queriesPerMonth?: number;
    };
    enabled: boolean;
  } | null;
}

interface AgentConfig {
  agentId: string;
  agentName: string;
  limits: {
    queriesPerMinute?: number;
    queriesPerHour?: number;
    queriesPerDay?: number;
    queriesPerMonth?: number;
  };
  enabled: boolean;
}

export function AgentRateLimits() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [editingAgent, setEditingAgent] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<AgentConfig | null>(null);
  const [searchDebounce, setSearchDebounce] = useState<NodeJS.Timeout | null>(null);

  // Fetch agents with search and pagination
  const fetchAgents = useCallback(async (page: number, search?: string) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        withConfig: 'true'
      });
      
      if (search) {
        params.append('search', search);
      }

      const response = await fetch(`/api/admin/agents?${params}`);
      const data = await response.json();

      if (data.success) {
        setAgents(data.data.agents);
        setTotalPages(data.data.pagination.totalPages);
      }
    } catch (error) {
      console.error('Failed to fetch agents:', error);
      toast.error('Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchAgents(currentPage, searchTerm);
  }, [currentPage]);

  // Handle search with debounce
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    
    if (searchDebounce) {
      clearTimeout(searchDebounce);
    }

    const timeout = setTimeout(() => {
      setCurrentPage(1);
      fetchAgents(1, value);
    }, 300);

    setSearchDebounce(timeout);
  };

  // Start editing an agent
  const startEdit = (agent: Agent) => {
    setEditingAgent(agent.id);
    setEditForm({
      agentId: agent.id,
      agentName: agent.name,
      limits: agent.rateLimitConfig?.limits || {
        queriesPerHour: 10,
        queriesPerDay: 100,
        queriesPerMonth: 1000
      },
      enabled: agent.rateLimitConfig?.enabled ?? true
    });
  };

  // Cancel editing
  const cancelEdit = () => {
    setEditingAgent(null);
    setEditForm(null);
  };

  // Save agent configuration
  const saveConfig = async () => {
    if (!editForm) return;

    try {
      const response = await fetch('/api/admin/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`Rate limits saved for ${editForm.agentName}`);
        cancelEdit();
        fetchAgents(currentPage, searchTerm);
      } else {
        toast.error(data.error || 'Failed to save configuration');
      }
    } catch (error) {
      console.error('Failed to save config:', error);
      toast.error('Failed to save configuration');
    }
  };

  // Delete agent configuration
  const deleteConfig = async (agentId: string, agentName: string) => {
    if (!confirm(`Remove rate limit configuration for ${agentName}?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/agents/${agentId}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`Rate limits removed for ${agentName}`);
        fetchAgents(currentPage, searchTerm);
      } else {
        toast.error(data.error || 'Failed to delete configuration');
      }
    } catch (error) {
      console.error('Failed to delete config:', error);
      toast.error('Failed to delete configuration');
    }
  };

  // Reset counters for an agent
  const resetCounters = async (agentId: string, agentName: string) => {
    if (!confirm(`Reset all counters for ${agentName}?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/agents/${agentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' })
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`Counters reset for ${agentName}`);
      } else {
        toast.error(data.error || 'Failed to reset counters');
      }
    } catch (error) {
      console.error('Failed to reset counters:', error);
      toast.error('Failed to reset counters');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-6 bg-card border-border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Agent-Specific Rate Limits
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Configure query limits for individual agents/projects
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search agents by name or ID..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Agents List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-12">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              {searchTerm ? 'No agents found matching your search' : 'No agents available'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className={cn(
                  "p-4 rounded-lg border transition-colors",
                  editingAgent === agent.id
                    ? "bg-accent/10 border-primary"
                    : "bg-background border-border hover:border-primary/50"
                )}
              >
                {editingAgent === agent.id && editForm ? (
                  // Edit Mode
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h3 className="font-medium text-foreground">{agent.name}</h3>
                        <p className="text-xs text-muted-foreground">ID: {agent.id}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={cancelEdit}
                        >
                          <X className="w-4 h-4" />
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={saveConfig}
                        >
                          <Save className="w-4 h-4 mr-1" />
                          Save
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                          Per Minute
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={editForm.limits.queriesPerMinute || ''}
                          onChange={(e) => setEditForm({
                            ...editForm,
                            limits: {
                              ...editForm.limits,
                              queriesPerMinute: e.target.value ? parseInt(e.target.value) : undefined
                            }
                          })}
                          placeholder="No limit"
                          className="w-full px-3 py-1.5 bg-background border border-border rounded text-foreground"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                          Per Hour
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={editForm.limits.queriesPerHour || ''}
                          onChange={(e) => setEditForm({
                            ...editForm,
                            limits: {
                              ...editForm.limits,
                              queriesPerHour: e.target.value ? parseInt(e.target.value) : undefined
                            }
                          })}
                          placeholder="No limit"
                          className="w-full px-3 py-1.5 bg-background border border-border rounded text-foreground"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                          Per Day
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={editForm.limits.queriesPerDay || ''}
                          onChange={(e) => setEditForm({
                            ...editForm,
                            limits: {
                              ...editForm.limits,
                              queriesPerDay: e.target.value ? parseInt(e.target.value) : undefined
                            }
                          })}
                          placeholder="No limit"
                          className="w-full px-3 py-1.5 bg-background border border-border rounded text-foreground"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                          Per Month
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={editForm.limits.queriesPerMonth || ''}
                          onChange={(e) => setEditForm({
                            ...editForm,
                            limits: {
                              ...editForm.limits,
                              queriesPerMonth: e.target.value ? parseInt(e.target.value) : undefined
                            }
                          })}
                          placeholder="No limit"
                          className="w-full px-3 py-1.5 bg-background border border-border rounded text-foreground"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`enabled-${agent.id}`}
                        checked={editForm.enabled}
                        onChange={(e) => setEditForm({
                          ...editForm,
                          enabled: e.target.checked
                        })}
                        className="rounded border-border"
                      />
                      <label htmlFor={`enabled-${agent.id}`} className="text-sm text-foreground">
                        Enable rate limiting for this agent
                      </label>
                    </div>
                  </div>
                ) : (
                  // View Mode
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-medium text-foreground">{agent.name}</h3>
                        {agent.rateLimitConfig?.enabled && (
                          <span className="px-2 py-0.5 text-xs bg-success/10 text-success rounded-full">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">ID: {agent.id}</p>
                      
                      {agent.rateLimitConfig && (
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          {agent.rateLimitConfig.limits.queriesPerMinute && (
                            <span>{agent.rateLimitConfig.limits.queriesPerMinute}/min</span>
                          )}
                          {agent.rateLimitConfig.limits.queriesPerHour && (
                            <span>{agent.rateLimitConfig.limits.queriesPerHour}/hour</span>
                          )}
                          {agent.rateLimitConfig.limits.queriesPerDay && (
                            <span>{agent.rateLimitConfig.limits.queriesPerDay}/day</span>
                          )}
                          {agent.rateLimitConfig.limits.queriesPerMonth && (
                            <span>{agent.rateLimitConfig.limits.queriesPerMonth}/month</span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {agent.rateLimitConfig && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => resetCounters(agent.id, agent.name)}
                            title="Reset counters"
                          >
                            <Clock className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteConfig(agent.id, agent.name)}
                            title="Remove configuration"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant={agent.rateLimitConfig ? "ghost" : "default"}
                        onClick={() => startEdit(agent)}
                      >
                        {agent.rateLimitConfig ? (
                          <Edit className="w-4 h-4" />
                        ) : (
                          <>
                            <Plus className="w-4 h-4 mr-1" />
                            Configure
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            
            <span className="px-3 py-1 text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </Card>

      {/* Info Box */}
      <Card className="p-4 bg-primary/5 border-primary/20">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-primary mt-0.5" />
          <div className="text-sm text-foreground">
            <p className="font-medium mb-1">How Agent Rate Limiting Works</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>• Limits apply to conversation/query endpoints for each agent</li>
              <li>• Users are identified by JWT token, session, or IP address</li>
              <li>• Counters reset automatically at the end of each time window</li>
              <li>• Leave a field empty to have no limit for that time window</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
