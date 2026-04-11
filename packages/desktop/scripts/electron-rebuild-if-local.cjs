'use strict'

const { spawnSync } = require('node:child_process')

// Vercel installs the full workspace when building packages/landing; skip native Electron rebuild.
if (process.env.VERCEL === '1') {
  process.exit(0)
}

const result = spawnSync(
  'npx',
  ['electron-rebuild', '-f', '-w', 'better-sqlite3-multiple-ciphers,uiohook-napi,keytar'],
  { stdio: 'inherit', shell: true, cwd: require('node:path').join(__dirname, '..') }
)

process.exit(result.status === null ? 1 : result.status)
