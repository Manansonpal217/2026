import fs from 'node:fs'
import path from 'node:path'
import { log } from './logger.js'

export interface AgentState {
  completedFullBackfill: boolean
}

export function statePathForConfig(configPath: string): string {
  return path.join(path.dirname(path.resolve(configPath)), 'tracksync-agent.state.json')
}

export function loadAgentState(configPath: string): AgentState {
  const p = statePathForConfig(configPath)
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as unknown
    if (
      raw !== null &&
      typeof raw === 'object' &&
      (raw as AgentState).completedFullBackfill === true
    ) {
      return { completedFullBackfill: true }
    }
  } catch {
    // missing or invalid
  }
  return { completedFullBackfill: false }
}

export function markFullBackfillComplete(configPath: string): void {
  const p = statePathForConfig(configPath)
  try {
    fs.writeFileSync(p, JSON.stringify({ completedFullBackfill: true }, null, 0), 'utf8')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log.warn(`Could not write agent state (${msg}): ${p}`)
  }
}
