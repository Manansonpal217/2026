import type { IntegrationAdapter } from './adapter.js'

const registry = new Map<string, IntegrationAdapter>()

export function registerAdapter(adapter: IntegrationAdapter): void {
  registry.set(adapter.type, adapter)
}

export function getRegistry(): Map<string, IntegrationAdapter> {
  return registry
}

/**
 * Returns a registered adapter or throws an error with statusCode 503 for HTTP layers.
 */
export function getAdapter(provider: string): IntegrationAdapter {
  const adapter = registry.get(provider)
  if (!adapter) {
    const err = new Error(`Integration provider "${provider}" is not available`) as Error & {
      statusCode: number
      code: string
    }
    err.statusCode = 503
    err.code = 'INTEGRATION_NOT_CONFIGURED'
    throw err
  }
  return adapter
}

/** Call once during app startup to register all adapters. */
export async function initAdapters(): Promise<void> {
  const { jiraAdapter } = await import('./jira.js')
  const { asanaAdapter } = await import('./asana.js')
  registerAdapter(jiraAdapter)
  registerAdapter(asanaAdapter)
}
