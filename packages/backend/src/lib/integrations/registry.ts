import type { IntegrationAdapter } from './adapter.js'

const registry = new Map<string, IntegrationAdapter>()

export function registerAdapter(adapter: IntegrationAdapter): void {
  registry.set(adapter.type, adapter)
}

export function getRegistry(): Map<string, IntegrationAdapter> {
  return registry
}

/** Call once during app startup to register all adapters. */
export async function initAdapters(): Promise<void> {
  const { jiraAdapter } = await import('./jira.js')
  const { asanaAdapter } = await import('./asana.js')
  registerAdapter(jiraAdapter)
  registerAdapter(asanaAdapter)
}
