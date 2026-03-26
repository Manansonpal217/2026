import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

/** Inlined at build time so packaged apps know where to fetch latest.yml (generic provider). */
const TRACKSYNC_UPDATE_BASE_URL = JSON.stringify(process.env.AUTO_UPDATE_BASE_URL ?? '')
const SENTRY_DSN_BAKED = JSON.stringify(process.env.SENTRY_DSN ?? '')

export default defineConfig({
  main: {
    define: {
      __TRACKSYNC_UPDATE_BASE_URL__: TRACKSYNC_UPDATE_BASE_URL,
      __SENTRY_DSN__: SENTRY_DSN_BAKED,
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
})
