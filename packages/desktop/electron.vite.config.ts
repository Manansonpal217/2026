import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const root = resolve(__dirname)
  const fileEnv = loadEnv(mode, root, '')
  /** Shell / CI overrides .env.production (same as Vite client env rules). */
  const viteApiUrl = process.env.VITE_API_URL || fileEnv.VITE_API_URL || ''
  const viteLandingUrl = process.env.VITE_LANDING_URL || fileEnv.VITE_LANDING_URL || ''
  const asanaClientId = process.env.ASANA_CLIENT_ID || fileEnv.ASANA_CLIENT_ID || ''
  const asanaClientSecret = process.env.ASANA_CLIENT_SECRET || fileEnv.ASANA_CLIENT_SECRET || ''
  const asanaRedirectUri = process.env.ASANA_REDIRECT_URI || fileEnv.ASANA_REDIRECT_URI || ''

  /** Inlined at build time so packaged apps know where to fetch latest.yml (generic provider). */
  const TRACKSYNC_UPDATE_BASE_URL = JSON.stringify(process.env.AUTO_UPDATE_BASE_URL ?? '')
  const SENTRY_DSN_BAKED = JSON.stringify(process.env.SENTRY_DSN ?? '')

  return {
    main: {
      define: {
        __TRACKSYNC_UPDATE_BASE_URL__: TRACKSYNC_UPDATE_BASE_URL,
        __SENTRY_DSN__: SENTRY_DSN_BAKED,
        // Packaged apps do not ship .env; bake URLs at build time (see .env.production.example).
        'process.env.VITE_API_URL': JSON.stringify(viteApiUrl),
        'process.env.VITE_LANDING_URL': JSON.stringify(viteLandingUrl),
        'process.env.ASANA_CLIENT_ID': JSON.stringify(asanaClientId),
        'process.env.ASANA_CLIENT_SECRET': JSON.stringify(asanaClientSecret),
        'process.env.ASANA_REDIRECT_URI': JSON.stringify(asanaRedirectUri),
      },
      plugins: [externalizeDepsPlugin()],
      build: {
        rollupOptions: {
          input: {
            index: resolve(__dirname, 'src/main/index.ts'),
          },
        },
      },
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
      build: {
        rollupOptions: {
          input: {
            index: resolve(__dirname, 'src/preload/index.ts'),
          },
        },
      },
    },
    renderer: {
      root: 'src/renderer',
      build: {
        rollupOptions: {
          input: {
            index: resolve(__dirname, 'src/renderer/index.html'),
          },
        },
      },
      plugins: [react()],
    },
  }
})
