import type { JiraIssue } from './jira.js'
import { jiraIssueToIngestRow } from './jiraToIngest.js'
import { log } from './logger.js'

export const AGENT_VERSION = '1.0.0'

/** TrackSync POST /ingest/jira accepts at most this many issues per request. */
const INGEST_CHUNK_SIZE = 500

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function postIngestChunk(
  url: string,
  token: string,
  chunk: JiraIssue[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const payload = { issues: chunk.map(jiraIssueToIngestRow) }
  const maxAttempts = 3
  let lastError = 'unknown error'

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        return { ok: true }
      }
      const text = await res.text().catch(() => '')
      lastError = `HTTP ${res.status} ${text.slice(0, 300)}`
      if (attempt < maxAttempts && (res.status >= 500 || res.status === 429)) {
        const backoffMs = 1000 * 2 ** (attempt - 1)
        log.error(`TrackSync ingest failed (${lastError}). Retrying in ${backoffMs / 1000}s...`)
        await sleep(backoffMs)
        continue
      }
      log.error(`TrackSync ingest failed: ${lastError}`)
      return { ok: false, error: lastError }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      lastError = msg
      if (attempt < maxAttempts) {
        const backoffMs = 1000 * 2 ** (attempt - 1)
        log.error(`TrackSync unreachable (${msg}). Retrying in ${backoffMs / 1000}s...`)
        await sleep(backoffMs)
        continue
      }
      log.error(`TrackSync ingest failed after retries: ${msg}`)
      return { ok: false, error: msg }
    }
  }
  return { ok: false, error: lastError }
}

export async function sendToTrackSync(
  apiUrl: string,
  token: string,
  issues: JiraIssue[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = `${apiUrl}/ingest/jira`
  const n = issues.length
  const chunks = Math.max(1, Math.ceil(n / INGEST_CHUNK_SIZE))

  for (let i = 0; i < n; i += INGEST_CHUNK_SIZE) {
    const chunk = issues.slice(i, i + INGEST_CHUNK_SIZE)
    const result = await postIngestChunk(url, token, chunk)
    if (!result.ok) {
      return result
    }
  }

  if (chunks > 1) {
    log.info(`✅ Sent ${n} issues to TrackSync (${chunks} requests).`)
  } else {
    log.info(`✅ Sent ${n} issues to TrackSync.`)
  }
  return { ok: true }
}
