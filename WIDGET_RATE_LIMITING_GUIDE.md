# Widget Rate Limiting - Complete Guide

## Overview

This document explains how the rate limiting features built into the CustomGPT Starter Kit apply to embedded widgets, what infrastructure is required, and how customers can deploy it.

---

## Table of Contents

1. [Quick Summary](#quick-summary)
2. [Widget Architecture](#widget-architecture)
3. [Rate Limiting Implementation](#rate-limiting-implementation)
4. [Deployment Requirements](#deployment-requirements)
5. [Configuration Guide](#configuration-guide)
6. [Customer Use Cases](#customer-use-cases)
7. [Technical Deep Dive](#technical-deep-dive)

---

## Quick Summary

**Question:** Do the rate limiting features affect widgets?

**Answer:** YES, but ONLY when widgets use proxy mode (production setup).

**Requirement:** The Next.js starter kit must be deployed somewhere to act as the proxy server. A simple CLI proxy is NOT sufficient for rate limiting.

---

## Widget Architecture

### Two Deployment Modes

#### 1. Direct Mode (Development/Testing Only)
```javascript
CustomGPTWidget.init({
  agentId: '123',
  apiKey: 'sk-xxx',  // API key exposed in browser
  mode: 'floating'
});
```

**Flow:**
```
Widget → CustomGPT.ai API (directly)
```

**Rate Limiting:** ❌ **NONE** (bypasses all your server logic)

**Use Case:** Quick prototypes, internal tools, development only

---

#### 2. Proxy Mode (Production) ⭐
```javascript
CustomGPTWidget.init({
  agentId: '123',
  apiBaseUrl: 'https://your-domain.com/api/proxy',
  mode: 'floating'
});
```

**Flow:**
```
Widget → Your Next.js Server → CustomGPT.ai API
         ↑
         Rate limiting happens here
```

**Rate Limiting:** ✅ **FULLY ENFORCED**

**Use Case:** Production websites, customer-facing applications

---

## Rate Limiting Implementation

### What Gets Protected

When widgets use proxy mode, these endpoints get rate-limited:

#### 1. Creating Conversations
```
POST /api/proxy/projects/{agentId}/conversations
```

**Protection Applied:**
- IP blocking check
- Agent-specific rate limits
- Identity tracking

#### 2. Sending Messages (Queries)
```
POST /api/proxy/projects/{agentId}/conversations/{sessionId}/messages
```

**Protection Applied:**
- IP blocking check
- Agent-specific rate limits
- Identity tracking

---

### Rate Limit Types

#### Per-Agent Limits
Configured in: **Settings > Rate Limiting > Agents**

```json
{
  "agentId": "123",
  "enabled": true,
  "limits": {
    "queriesPerMinute": 5,
    "queriesPerHour": 100,
    "queriesPerDay": 1000,
    "queriesPerMonth": 10000
  }
}
```

**Applies to:** ALL requests to that agent (from main app OR widgets)

#### IP-Based Controls
Configured in: **Settings > Rate Limiting > IP Management**

**Options:**
- Block specific IPs completely (403 response)
- Set custom limits per IP (override agent limits)

#### Identity Detection
**Order of detection:**
1. JWT token (if authentication is implemented) → `jwt:user-id`
2. Session cookie → `session:cookie-value`
3. IP address (hashed) → `ip:sha256-hash`
4. Fallback → `anonymous`

---

## Deployment Requirements

### What's Required for Rate Limiting

**You MUST deploy the Next.js starter kit** (or at minimum, the API routes portion).

### Why?

The rate limiting logic lives in these files:
- `src/app/api/proxy/projects/[projectId]/conversations/route.ts`
- `src/app/api/proxy/projects/[projectId]/conversations/[sessionId]/messages/route.ts`
- `src/lib/agent-rate-limiter.ts`
- `src/lib/identity.ts`

These are Next.js API routes with:
- Redis integration (Upstash)
- Rate limit checking logic
- IP blocking logic
- Identity extraction
- Configuration management

**A simple Express proxy CANNOT do this** - it doesn't have the rate limiting code.

---

## Deployment Options

### Option 1: Full Next.js Deployment (Recommended)

**Deploy to:**
- Vercel (easiest)
- Any Node.js hosting (Railway, Render, DigitalOcean, AWS, etc.)

**What you get:**
- ✅ Full rate limiting features
- ✅ Admin UI to configure limits
- ✅ Dashboard to monitor usage
- ✅ IP management interface
- ✅ The main chat application
- ✅ Widget support with full protection

**Environment Variables Required:**
```env
CUSTOMGPT_API_KEY=your_api_key
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token
```

**Widget Configuration:**
```javascript
CustomGPTWidget.init({
  agentId: '123',
  apiBaseUrl: 'https://your-deployed-app.com/api/proxy',
  mode: 'floating'
});
```

---

### Option 2: Standalone Proxy (examples/universal-customgpt-proxy.js)

**What it is:**
- Simple Express.js server (~200 lines)
- Basic API key hiding
- NO rate limiting
- NO admin UI
- NO Redis

**What you get:**
- ❌ NO rate limiting
- ❌ NO IP blocking
- ❌ NO usage tracking
- ✅ API key stays server-side (security only)

**Code snippet:**
```javascript
// This is ALL it does:
app.use('/api/proxy/*', async (req, res) => {
  const apiPath = req.params[0];
  const response = await fetch(`https://app.customgpt.ai/api/v1/${apiPath}`, {
    headers: {
      'Authorization': `Bearer ${process.env.CUSTOMGPT_API_KEY}`
    },
    body: JSON.stringify(req.body)
  });
  res.json(await response.json());
});
```

**Use Case:**
- Quick prototypes
- When rate limiting is NOT needed
- Simple API key security

**Widget Configuration:**
```javascript
CustomGPTWidget.init({
  agentId: '123',
  apiBaseUrl: 'http://localhost:3001/api/proxy',
  mode: 'floating'
});
```

---

### Comparison Table

| Feature | Full Next.js Deployment | Standalone Proxy | Direct Mode |
|---------|------------------------|------------------|-------------|
| **Rate Limiting** | ✅ YES | ❌ NO | ❌ NO |
| **IP Blocking** | ✅ YES | ❌ NO | ❌ NO |
| **Per-Agent Limits** | ✅ YES | ❌ NO | ❌ NO |
| **Admin UI** | ✅ YES | ❌ NO | ❌ NO |
| **Usage Tracking** | ✅ YES | ❌ NO | ❌ NO |
| **API Key Security** | ✅ YES | ✅ YES | ❌ NO (exposed) |
| **Redis Required** | ✅ YES | ❌ NO | ❌ NO |
| **Deployment Complexity** | Medium | Easy | None |
| **Production Ready** | ✅ YES | ⚠️ Limited | ❌ NO |

---

## Configuration Guide

### Step 1: Deploy Next.js Application

**Vercel (Recommended):**
```bash
# 1. Push to GitHub
git push origin main

# 2. Connect to Vercel
# - Go to vercel.com
# - Import repository
# - Add environment variables
# - Deploy

# 3. Get deployment URL
# https://your-app.vercel.app
```

**Manual Deployment:**
```bash
# 1. Build
npm run build

# 2. Start production server
npm start

# 3. Proxy through nginx/caddy
```

### Step 2: Configure Redis (Upstash)

```bash
# 1. Go to console.upstash.com
# 2. Create new database
# 3. Copy REST URL and Token
# 4. Add to environment variables
```

### Step 3: Configure Rate Limits

**Via Admin UI:**
1. Navigate to `https://your-app.com/settings`
2. Go to "Rate Limiting" tab
3. Click "Agents" sub-tab
4. Configure limits per agent:
   - Queries per minute: 5
   - Queries per hour: 100
   - Queries per day: 1000
   - Enable rate limiting checkbox

### Step 4: Deploy Widgets

**Embed on customer website:**
```html
<script src="https://cdn.jsdelivr.net/gh/Poll-The-People/customgpt-starter-kit@main/dist/widget/customgpt-widget.js"></script>
<script>
  CustomGPTWidget.init({
    agentId: '123',
    apiBaseUrl: 'https://your-app.vercel.app/api/proxy',
    mode: 'floating',
    position: 'bottom-right'
  });
</script>
```

---

## Customer Use Cases

### Use Case 1: SaaS with Multiple Tenants

**Scenario:**
- Multiple customers embedding widgets
- Each customer gets their own agent
- Need to prevent abuse per customer

**Solution:**
```javascript
// Customer A's widget (Agent 100)
CustomGPTWidget.init({
  agentId: '100',
  apiBaseUrl: 'https://your-saas.com/api/proxy'
});

// Customer B's widget (Agent 101)
CustomGPTWidget.init({
  agentId: '101',
  apiBaseUrl: 'https://your-saas.com/api/proxy'
});
```

**Configuration:**
- Agent 100: 50 queries/hour
- Agent 101: 500 queries/hour (premium)

**Result:** Each customer's widget traffic is independently rate-limited.

---

### Use Case 2: Public Website with Free Chat

**Scenario:**
- Public website with embedded chat
- Want to prevent abuse
- Anonymous users

**Solution:**
```javascript
CustomGPTWidget.init({
  agentId: '123',
  apiBaseUrl: 'https://your-site.com/api/proxy'
});
```

**Configuration:**
- Agent 123: 5 queries/minute, 20 queries/hour per IP
- Block known bot IPs

**Result:** Each visitor (by IP) can only send 5 messages per minute.

---

### Use Case 3: Authenticated Users

**Scenario:**
- Users log in to your app
- Want per-user limits instead of per-IP

**Solution:**
Implement JWT authentication:

```javascript
// Backend: Generate JWT with user ID
const token = jwt.sign({ sub: 'user-123' }, secret);

// Frontend: Pass to widget
CustomGPTWidget.init({
  agentId: '123',
  apiBaseUrl: 'https://your-app.com/api/proxy',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

**Configuration:**
- Configure JWT secret in admin settings
- Set per-user limits

**Result:** Rate limiting tracks by user ID, not IP. Users can switch devices but limits follow them.

---

## Technical Deep Dive

### Request Flow (Proxy Mode)

```
1. User types message in widget
   ↓
2. Widget calls: POST https://your-app.com/api/proxy/projects/123/conversations/abc/messages
   ↓
3. Next.js API Route Handler
   ├─→ Extract identity (JWT → Session → IP)
   ├─→ Check if IP is blocked
   ├─→ Get agent rate limit config from Redis
   ├─→ Check all time windows (minute/hour/day/month)
   ├─→ If over limit → Return 429 with retry-after
   └─→ If allowed → Increment counters & forward to CustomGPT API
   ↓
4. CustomGPT API processes request
   ↓
5. Response flows back through proxy
   ↓
6. Widget displays message
```

### Redis Data Structure

**Rate limit counters:**
```
agent:ratelimit:counter:minute:123:ip:abc123 = 4
agent:ratelimit:counter:hour:123:ip:abc123 = 45
agent:ratelimit:counter:day:123:ip:abc123 = 234
```

**Agent configuration:**
```
agent:ratelimit:config:123 = {
  "enabled": true,
  "limits": {
    "queriesPerMinute": 5,
    "queriesPerHour": 100,
    "queriesPerDay": 1000
  }
}
```

**IP blocks:**
```
ip:block:192.168.1.1 = {
  "blocked": true,
  "reason": "Spam bot detected",
  "blockedAt": "2024-01-01T00:00:00Z"
}
```

### Error Responses

**429 Rate Limit Exceeded:**
```json
{
  "error": "Rate limit exceeded",
  "message": "Too many queries for this agent. Try again in 45 seconds.",
  "details": {
    "agentId": "123",
    "window": "minute",
    "limit": 5,
    "remaining": 0,
    "resetTime": 1704067200,
    "retryAfter": 45
  }
}
```

**Headers:**
```
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1704067200
Retry-After: 45
```

## Conclusion

**Bottom Line:**
- Rate limiting features work great with widgets
- **Requires full Next.js deployment** (not just the standalone proxy)
- Customers choose based on their needs:
  - Need rate limiting? → Deploy full stack
  - Just need API key security? → Use standalone proxy
  - Internal tool? → Use direct mode

The architecture is solid and production-ready. The main decision point is deployment complexity vs. feature set.

