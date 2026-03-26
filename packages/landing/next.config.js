const path = require('path')

// Vercel runs `next build` for serverless; `standalone` is for Docker/Node images only
// and breaks the standard Vercel deployment output (see vercel/next.js#43654).
const isVercel = process.env.VERCEL === '1'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(!isVercel ? { output: 'standalone' } : {}),
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' },
    ],
  },
  experimental: {
    // Monorepo: trace files from repo root
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
