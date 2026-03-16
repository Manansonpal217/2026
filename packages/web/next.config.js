/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production'

// In dev: allow http://localhost:* for the API and ws://localhost:* for HMR.
// In prod: only allow https: origins.
const connectSrc = isDev
  ? "connect-src 'self' http://localhost:* ws://localhost:* wss://localhost:* https:"
  : "connect-src 'self' https:"

// Allow Google Fonts stylesheet and font files in both envs.
const styleSrc = "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com"
const fontSrc = "font-src 'self' https://fonts.gstatic.com data:"

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              styleSrc,
              "img-src 'self' data: blob: https:",
              fontSrc,
              connectSrc,
              "frame-ancestors 'none'",
            ].join('; '),
          },
          // HSTS only meaningful in production (browsers ignore it on HTTP anyway)
          ...(isDev
            ? []
            : [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=31536000; includeSubDomains; preload',
                },
              ]),
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
