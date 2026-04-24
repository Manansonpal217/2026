'use strict'

const { spawnSync } = require('node:child_process')

// Vercel installs the full workspace when building packages/landing; skip native Electron rebuild.
if (process.env.VERCEL === '1') {
  process.exit(0)
}

const result = spawnSync(
  'npx',
  [
    'electron-rebuild',
    '-f',
    '-w',
    'better-sqlite3-multiple-ciphers,uiohook-napi,keytar,get-windows',
  ],
  { stdio: 'inherit', shell: true, cwd: require('node:path').join(__dirname, '..') }
)

// Exit 0 even on rebuild failure so `npm install` does not abort; the app will
// still start in dev mode — native-module failures surface at runtime with a clear warning.
process.exit(result.status === null ? 0 : result.status)
