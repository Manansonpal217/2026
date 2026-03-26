#!/usr/bin/env node
/**
 * Cross-platform dev orchestrator: backend + landing + desktop.
 * Replaces dev-all.sh (lsof/kill) for Windows/macOS/Linux.
 */
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { spawn } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

async function freePorts(ports) {
  const { default: killPort } = await import('kill-port')
  for (const port of ports) {
    try {
      await killPort(port)
      console.log(`Freed port ${port} if it was in use.`)
    } catch {
      // Port already free or kill-port quirk — continue
    }
  }
}

await freePorts([3001, 3002])

console.log('')
console.log('Starting TrackSync development environment...')
console.log('  - Backend:  http://localhost:3001')
console.log('  - Landing:  http://localhost:3002')
console.log('  - Desktop:  Electron app')
console.log('')
console.log('Press Ctrl+C to stop all')
console.log('----------------------------------------')
console.log('')

const { default: concurrently } = await import('concurrently')

const result = concurrently(
  [
    { command: 'pnpm run dev:backend', name: 'backend', prefixColor: 'blue' },
    { command: 'pnpm run dev:landing', name: 'landing', prefixColor: 'green' },
    { command: 'pnpm run dev:desktop', name: 'desktop', prefixColor: 'magenta' },
  ],
  {
    cwd: root,
    prefix: 'name',
    killOthersOn: ['failure', 'success'],
    restartTries: 0,
  },
)

try {
  await result.result
} catch {
  process.exitCode = 1
}
