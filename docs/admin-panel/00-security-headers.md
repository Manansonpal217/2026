# Admin Panel — Security Headers & Hardening

**Stack:** Next.js 14 (App Router)  
**File:** `next.config.js`

---

## Overview

The web admin panel displays employee screenshots, financial data, and sensitive org configuration. Security headers prevent clickjacking, XSS, MIME-sniffing, and data leakage. These must be set from day one.

---

## `next.config.js` — Security Headers

```javascript
// next.config.js
const securityHeaders = [
  // Prevent clickjacking — admin panel must never be embedded in iframes
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  // Force HTTPS for 2 years, include subdomains
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  // Prevent MIME-type sniffing
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  // Minimal referrer info (don't leak admin URLs to third parties)
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  // Restrict browser features
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  // Content Security Policy — blocks XSS from injected scripts
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Scripts: only from self + Next.js inline (nonce-based for inline scripts)
      "script-src 'self' 'nonce-{NONCE}'",
      // Styles: self + shadcn/ui inline styles
      "style-src 'self' 'unsafe-inline'",
      // Images: self + S3 CloudFront CDN (for screenshots)
      `img-src 'self' data: https://${process.env.CLOUDFRONT_DOMAIN}`,
      // Fonts: self only
      "font-src 'self'",
      // API calls: only to our own backend
      `connect-src 'self' https://api.tracksync.io wss://api.tracksync.io`,
      // No iframes allowed
      "frame-src 'none'",
      // No plugins (Flash etc.)
      "object-src 'none'",
      // Upgrade HTTP to HTTPS
      'upgrade-insecure-requests',
    ].join('; '),
  },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)', // applies to all routes
        headers: securityHeaders,
      },
    ]
  },
}

module.exports = nextConfig
```

---

## Nonce-Based CSP for Inline Scripts

Next.js App Router supports nonce-based CSP to allow Next.js internal inline scripts while blocking injected scripts:

```typescript
// middleware.ts (runs on every request)
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

export function middleware(request: Request) {
  const nonce = randomBytes(16).toString('base64')
  const response = NextResponse.next()

  // Set nonce in response header for the layout to read
  response.headers.set('x-nonce', nonce)

  // Update CSP with this request's nonce
  const csp = response.headers.get('Content-Security-Policy')
  response.headers.set('Content-Security-Policy', csp?.replace('{NONCE}', nonce) ?? '')

  return response
}
```

---

## Screenshot Serving — Signed URL + CORS

Screenshots in the admin panel are served via CloudFront signed URLs. The S3 bucket blocks all direct access:

```typescript
// S3 bucket CORS policy (no public access)
{
  "CORSRules": [{
    "AllowedOrigins": ["https://app.tracksync.io"],
    "AllowedMethods": ["GET"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }]
}
```

CloudFront distributions serving screenshots have:

- `Restrict Viewer Access: Yes` (signed URLs required)
- `Trusted Key Groups`: only TrackSync backend key group
- `Default Cache Behavior`: `Cache-Control: private, no-store` (screenshots must not be CDN-cached)

---

## Cookie Security (NextAuth.js)

```typescript
// next-auth config
export const authOptions: NextAuthOptions = {
  cookies: {
    sessionToken: {
      name: '__Secure-next-auth.session-token',
      options: {
        httpOnly: true, // not accessible via JS
        sameSite: 'lax', // CSRF protection
        secure: true, // HTTPS only
        path: '/',
        maxAge: 60 * 60 * 8, // 8 hours
      },
    },
  },
  // ...
}
```

---

## XSS Prevention in Dynamic Content

The admin panel renders data from external sources (task titles from Jira, app names from activity logs, user-entered notes). All of this passes through React's automatic HTML escaping in JSX — but extra care is needed for:

```typescript
// NEVER use dangerouslySetInnerHTML with external data
// BAD:
<div dangerouslySetInnerHTML={{ __html: task.description }} />

// GOOD: use a sanitized markdown renderer
import DOMPurify from 'isomorphic-dompurify'
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(task.description) }} />

// Chart tooltips — use formatter functions, not raw HTML
<Tooltip formatter={(value, name) => [formatDuration(value), name]} />
```

---

## Security Headers Checklist

| Header                      | Value                                 | Protection          |
| --------------------------- | ------------------------------------- | ------------------- |
| `X-Frame-Options`           | `DENY`                                | Clickjacking        |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | HTTPS enforcement   |
| `X-Content-Type-Options`    | `nosniff`                             | MIME sniffing       |
| `Content-Security-Policy`   | Nonce-based script-src                | XSS injection       |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`     | URL leakage         |
| `Permissions-Policy`        | Deny camera/mic/geo                   | Feature misuse      |
| Cookie: `HttpOnly`          | true                                  | Cookie theft via JS |
| Cookie: `Secure`            | true                                  | HTTPS only          |
| Cookie: `SameSite`          | `lax`                                 | CSRF                |
