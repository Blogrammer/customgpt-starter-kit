"use client"

import { useState, useEffect } from "react"
import { Save, RotateCcw, AlertCircle, CheckCircle, Settings, Shield, Clock, Activity } from "lucide-react"

interface RateLimitConfig {
  global: {
    defaultPerMinute: number
    defaultPerHour: number
    defaultPerDay: number
    identityOrder: string[]
  }
  routes: {
    [route: string]: {
      perMinute?: number
      perHour?: number
      perDay?: number
    }
  }
  routesInScope: string[]
  rateLimitingEnabled: boolean
}

interface RouteStatus {
  pattern: string
  isProtected: boolean
  limits: any | null
  type: 'scope' | 'route-specific' | 'global'
}

interface RouteLimit {
  pattern: string
  perMinute: number
  perHour: number
  perDay: number
}

export function AdminConfiguration() {
  const [config, setConfig] = useState<RateLimitConfig | null>(null)
  const [originalConfig, setOriginalConfig] = useState<RateLimitConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [newRoute, setNewRoute] = useState<RouteLimit>({ pattern: "", perMinute: 60, perHour: 3600, perDay: 86400 })
  const [routeLimits, setRouteLimits] = useState<RouteLimit[]>([])
  const [routeStatuses, setRouteStatuses] = useState<RouteStatus[]>([])
  const [newRouteInScope, setNewRouteInScope] = useState("")

  useEffect(() => {
    fetchConfig()
    fetchRouteStatuses()
  }, [])

  const fetchConfig = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/config", {
        headers: {},
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const override = json.data?.override || {}
      const defaults = json.data?.defaults || {}
      const mergedRoutes = {
        ...(defaults.routes || {}),
        ...(override.routes || {}),
      }
      const src = Object.keys(override).length ? { ...defaults, ...override, routes: mergedRoutes } : { ...defaults, routes: mergedRoutes }
      
      const uiConfig: RateLimitConfig = {
        global: {
          defaultPerMinute: src.limits?.global?.minute ?? 60,
          defaultPerHour: src.limits?.global?.hour ?? 3600,
          defaultPerDay: src.limits?.global?.day ?? 86400,
          identityOrder: defaults.identityOrder?.map((v: string) =>
            v === "jwt-sub" ? "jwt" : v === "session-cookie" ? "session" : "ip",
          ) || ["jwt", "session", "ip"],
        },
        routes: src.routes || {},
        routesInScope: src.routesInScope || ["/api/proxy/projects", "/api/proxy/user"],
        rateLimitingEnabled: src.rateLimitingEnabled ?? true,
      }
      setConfig(uiConfig)
      setOriginalConfig(JSON.parse(JSON.stringify(uiConfig)))
      setRouteLimits(
        Object.entries(mergedRoutes).map(([pattern, limits]) => {
          const { perMinute, perHour, perDay } = limits as {
            perMinute?: number;
            perHour?: number;
            perDay?: number;
          };
          return {
            pattern,
            perMinute: perMinute || uiConfig.global.defaultPerMinute,
            perHour: perHour || uiConfig.global.defaultPerHour,
            perDay: perDay || uiConfig.global.defaultPerDay,
          };
        }),
      )
      setLoading(false)
    } catch (error) {
      console.error("Failed to fetch config:", error)
      setMessage({ type: "error", text: "Failed to load configuration" })
      setLoading(false)
    }
  }

  const fetchRouteStatuses = async () => {
    try {
      const res = await fetch("/api/admin/routes", {
        headers: {},
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setRouteStatuses(json.data || [])
    } catch (error) {
      console.error("Failed to fetch route statuses:", error)
    }
  }

  const saveConfig = async () => {
    if (!config) return

    setSaving(true)
    try {
      const payload = {
        global: config.global,
        routes: routeLimits.reduce(
          (acc, route) => {
            acc[route.pattern] = {
              perMinute: route.perMinute,
              perHour: route.perHour,
              perDay: route.perDay,
            }
            return acc
          },
          {} as { [route: string]: { perMinute?: number; perHour?: number; perDay?: number } },
        ),
        routesInScope: config.routesInScope,
        rateLimitingEnabled: config.rateLimitingEnabled,
      }
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setOriginalConfig(JSON.parse(JSON.stringify(config)))
      setMessage({ type: "success", text: "Configuration saved successfully" })
    } catch (error) {
      console.error("Failed to save config:", error)
      setMessage({ type: "error", text: "Failed to save configuration" })
    } finally {
      setSaving(false)
      setTimeout(() => setMessage(null), 3000)
    }
  }

  const resetConfig = () => {
    if (originalConfig) {
      setConfig(JSON.parse(JSON.stringify(originalConfig)))
      setRouteLimits(
        Object.entries(originalConfig.routes).map(([pattern, limits]) => ({
          pattern,
          perMinute: limits.perMinute || originalConfig.global.defaultPerMinute,
          perHour: limits.perHour || originalConfig.global.defaultPerHour,
          perDay: limits.perDay || originalConfig.global.defaultPerDay,
        })),
      )
      setMessage({ type: "success", text: "Configuration reset to last saved state" })
      setTimeout(() => setMessage(null), 3000)
    }
  }

  const updateGlobalConfig = (field: keyof RateLimitConfig["global"], value: any) => {
    if (!config) return
    setConfig({
      ...config,
      global: {
        ...config.global,
        [field]: value,
      },
    })
  }

  const updateRouteLimit = (index: number, field: keyof RouteLimit, value: any) => {
    setRouteLimits(routeLimits.map((route, i) => (i === index ? { ...route, [field]: value } : route)))
  }

  const addRouteLimit = () => {
    if (!newRoute.pattern) return

    setRouteLimits([...routeLimits, newRoute])
    setNewRoute({ pattern: "", perMinute: 60, perHour: 3600, perDay: 86400 })
  }

  const removeRouteLimit = (index: number) => {
    setRouteLimits(routeLimits.filter((_, i) => i !== index))
  }


  const addRouteInScope = () => {
    if (!newRouteInScope.trim()) return
    if (!config) return
    setConfig({
      ...config,
      routesInScope: [...config.routesInScope, newRouteInScope.trim()],
    })
    setNewRouteInScope("")
  }

  const removeRouteInScope = (index: number) => {
    if (!config) return
    setConfig({
      ...config,
      routesInScope: config.routesInScope.filter((_, i) => i !== index),
    })
  }

  const toggleRateLimiting = () => {
    if (!config) return
    setConfig({
      ...config,
      rateLimitingEnabled: !config.rateLimitingEnabled,
    })
  }

  const hasChanges = config && originalConfig && JSON.stringify(config) !== JSON.stringify(originalConfig)

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted animate-pulse rounded w-64"></div>
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-card shadow rounded-lg p-6">
              <div className="h-6 bg-muted animate-pulse rounded w-32 mb-4"></div>
              <div className="space-y-3">
                <div className="h-4 bg-muted animate-pulse rounded"></div>
                <div className="h-4 bg-muted animate-pulse rounded w-3/4"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!config) return null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Rate Limit Configuration</h1>
          <p className="mt-1 text-sm text-muted-foreground">Configure rate limiting rules and thresholds</p>
        </div>

        <div className="flex items-center space-x-4">
          {message && (
            <div
              className={`inline-flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                message.type === "success" ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400" : "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400"
              }`}
            >
              {message.type === "success" ? (
                <CheckCircle className="h-4 w-4 mr-2" />
              ) : (
                <AlertCircle className="h-4 w-4 mr-2" />
              )}
              {message.text}
            </div>
          )}

          <button
            onClick={resetConfig}
            disabled={!hasChanges}
            className="inline-flex items-center px-3 py-2 border border-border shadow-sm text-sm leading-4 font-medium rounded-md text-foreground bg-background hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </button>

          <button
            onClick={saveConfig}
            disabled={saving || !hasChanges}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring disabled:opacity-50"
          >
            <Save className={`h-4 w-4 mr-2 ${saving ? "animate-spin" : ""}`} />
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Global Settings */}
      <div className="bg-card shadow rounded-lg">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-lg font-medium text-foreground flex items-center">
            <Settings className="h-5 w-5 mr-2" />
            Global Rate Limits
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">Default rate limits applied to all endpoints</p>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                <Clock className="inline h-4 w-4 mr-1" />
                Per Minute
              </label>
              <input
                type="number"
                className="w-full border-input rounded-md shadow-sm focus:ring-ring focus:border-ring bg-background text-foreground"
                value={config.global.defaultPerMinute}
                onChange={(e) => updateGlobalConfig("defaultPerMinute", Number.parseInt(e.target.value))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                <Clock className="inline h-4 w-4 mr-1" />
                Per Hour
              </label>
              <input
                type="number"
                className="w-full border-input rounded-md shadow-sm focus:ring-ring focus:border-ring bg-background text-foreground"
                value={config.global.defaultPerHour}
                onChange={(e) => updateGlobalConfig("defaultPerHour", Number.parseInt(e.target.value))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                <Clock className="inline h-4 w-4 mr-1" />
                Per Day
              </label>
              <input
                type="number"
                className="w-full border-input rounded-md shadow-sm focus:ring-ring focus:border-ring bg-background text-foreground"
                value={config.global.defaultPerDay}
                onChange={(e) => updateGlobalConfig("defaultPerDay", Number.parseInt(e.target.value))}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Rate Limiting Toggle */}
      <div className="bg-card shadow rounded-lg">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-lg font-medium text-foreground flex items-center">
            <Activity className="h-5 w-5 mr-2" />
            Rate Limiting
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">Enable or disable rate limiting system-wide</p>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-foreground">Rate Limiting System</h4>
              <p className="text-sm text-muted-foreground">Controls whether rate limiting is active</p>
            </div>
            <button
              onClick={toggleRateLimiting}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
                config?.rateLimitingEnabled ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out ${
                  config?.rateLimitingEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>


      {/* Routes in Scope */}
      <div className="bg-card shadow rounded-lg">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-lg font-medium text-foreground flex items-center">
            <Settings className="h-5 w-5 mr-2" />
            Protected Routes
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">Routes that are protected by rate limiting and Turnstile</p>
        </div>
        <div className="p-6">
          {/* Add New Route */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              className="flex-1 border-input rounded-md shadow-sm focus:ring-ring focus:border-ring bg-background text-foreground"
              placeholder="/api/example"
              value={newRouteInScope}
              onChange={(e) => setNewRouteInScope(e.target.value)}
            />
            <button
              onClick={addRouteInScope}
              className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              Add Route
            </button>
          </div>

          {/* Routes List */}
          <div className="space-y-2">
            {config?.routesInScope.map((route, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-md">
                <span className="font-mono text-sm text-foreground">{route}</span>
                <button
                  onClick={() => removeRouteInScope(index)}
                  className="text-destructive hover:text-destructive/80 text-sm font-medium"
                >
                  Remove
                </button>
              </div>
            ))}
            {config?.routesInScope.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No routes configured</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
