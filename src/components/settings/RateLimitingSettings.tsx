"use client"

import { useState, useEffect } from "react"
import { Save, RotateCcw, AlertCircle, CheckCircle, Settings, Shield, Clock, ExternalLink, Lock } from "lucide-react"

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
  rateLimitingEnabled: boolean
}

interface RouteLimit {
  pattern: string
  perMinute: number
  perHour: number
  perDay: number
}

interface RateLimitingSettingsProps {}

export function RateLimitingSettings({}: RateLimitingSettingsProps) {
  const [config, setConfig] = useState<RateLimitConfig | null>(null)
  const [originalConfig, setOriginalConfig] = useState<RateLimitConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [newRoute, setNewRoute] = useState<RouteLimit>({ pattern: "", perMinute: 60, perHour: 3600, perDay: 86400 })
  const [routeLimits, setRouteLimits] = useState<RouteLimit[]>([])
  const [adminAuthenticated, setAdminAuthenticated] = useState(true) // Always authenticated now

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/config")
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

  const updateRateLimitingEnabled = (enabled: boolean) => {
    if (!config) return
    setConfig({
      ...config,
      rateLimitingEnabled: enabled,
    })
  }

  const hasChanges = config && originalConfig && JSON.stringify(config) !== JSON.stringify(originalConfig)

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-gray-200 animate-pulse rounded w-64"></div>
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white shadow rounded-lg p-6">
              <div className="h-6 bg-gray-200 animate-pulse rounded w-32 mb-4"></div>
              <div className="space-y-3">
                <div className="h-4 bg-gray-200 animate-pulse rounded"></div>
                <div className="h-4 bg-gray-200 animate-pulse rounded w-3/4"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!config) return null

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mt-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Rate Limiting</h2>
          <p className="mt-1 text-xs text-gray-500">Configure rate limiting rules and thresholds</p>
        </div>

        <div className="flex items-center space-x-3">
          {message && (
            <div
              className={`inline-flex items-center px-2.5 py-1.5 rounded-md text-xs font-medium ${
                message.type === "success" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
              }`}
            >
              {message.type === "success" ? (
                <CheckCircle className="h-3 w-3 mr-1" />
              ) : (
                <AlertCircle className="h-3 w-3 mr-1" />
              )}
              {message.text}
            </div>
          )}

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
            <Save className={`h-3 w-3 mr-1 ${saving ? "animate-spin" : ""}`} />
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Rate Limiting Toggle */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-base font-medium text-gray-900 flex items-center">
            <Shield className="h-4 w-4 mr-2" />
            Rate Limiting Control
          </h3>
          <p className="mt-1 text-xs text-gray-500">Enable or disable rate limiting for all API endpoints</p>
        </div>
        <div className="p-4">
          <div className="flex items-center">
            <input
              type="checkbox"
              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              checked={config.rateLimitingEnabled}
              onChange={(e) => updateRateLimitingEnabled(e.target.checked)}
            />
            <label className="ml-2 block text-xs text-gray-900">Enable rate limiting</label>
          </div>
        </div>
      </div>

      {/* Global Settings */}
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
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                <Clock className="inline h-3 w-3 mr-1" />
                Per Minute
              </label>
              <input
                type="number"
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                value={config.global.defaultPerMinute}
                onChange={(e) => updateGlobalConfig("defaultPerMinute", Number.parseInt(e.target.value))}
                disabled={!config.rateLimitingEnabled}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Clock className="inline h-4 w-4 mr-1" />
                Per Hour
              </label>
              <input
                type="number"
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                value={config.global.defaultPerHour}
                onChange={(e) => updateGlobalConfig("defaultPerHour", Number.parseInt(e.target.value))}
                disabled={!config.rateLimitingEnabled}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Clock className="inline h-4 w-4 mr-1" />
                Per Day
              </label>
              <input
                type="number"
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                value={config.global.defaultPerDay}
                onChange={(e) => updateGlobalConfig("defaultPerDay", Number.parseInt(e.target.value))}
                disabled={!config.rateLimitingEnabled}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
