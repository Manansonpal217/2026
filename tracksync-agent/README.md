# TrackSync Jira Agent

A production-oriented Node.js 20 service that runs on your network, reads issues from **self-hosted Jira (Data Center)** via the REST API, and pushes sanitized payloads to the TrackSync API (`api.tracksync.dev`).

## Configure `tracksync-agent.config.yaml`

Copy `tracksync-agent.config.yaml` and set:

| Section     | Field                    | Description                                                                                                                                                                                                                  |
| ----------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jira`      | `baseUrl`                | Jira root URL (no trailing slash), e.g. `https://jira.company.com`                                                                                                                                                           |
| `jira`      | `pat`                    | Jira **Personal Access Token** (see below)                                                                                                                                                                                   |
| `tracksync` | `apiUrl`                 | TrackSync **agent API base** (include the `/v1/agent` prefix), e.g. `https://api.tracksync.dev/v1/agent` or `http://localhost:3001/v1/agent`                                                                                 |
| `tracksync` | `token`                  | Organization API token from TrackSync                                                                                                                                                                                        |
| `sync`      | `syncAllIssues`          | If `true`, JQL uses only `updated >= …` (all projects, types, statuses). When `false`, `projects` / `issueTypes` / `statuses` are required.                                                                                  |
| `sync`      | `fullBackfillOnFirstRun` | If `true`, the agent runs **one** full-catalog Jira search (no `updated` window), then records `tracksync-agent.state.json` beside your config so restarts stay incremental. Delete that file if you need to backfill again. |
| `sync`      | `pollIntervalMinutes`    | How often to poll Jira (also used in incremental JQL window after the first run)                                                                                                                                             |
| `sync`      | `projects`               | Jira project keys to include (optional when `syncAllIssues` is true)                                                                                                                                                         |
| `sync`      | `issueTypes`             | Issue types to include (optional when `syncAllIssues` is true)                                                                                                                                                               |
| `sync`      | `statuses`               | Status names to include (optional when `syncAllIssues` is true)                                                                                                                                                              |
| `sync`      | `fields`                 | Jira `fields` requested on each issue                                                                                                                                                                                        |
| `sync`      | `excludeFields`          | Field names stripped from `issue.fields` before ingest (e.g. `comment`, `attachments`)                                                                                                                                       |

### Environment variable overrides

Values in the file can be overridden (useful with Docker secrets):

- `JIRA_BASE_URL` — overrides `jira.baseUrl`
- `JIRA_PAT` — overrides `jira.pat`
- `TRACKSYNC_API_URL` — overrides `tracksync.apiUrl`
- `TRACKSYNC_TOKEN` — overrides `tracksync.token`
- `TRACKSYNC_AGENT_CONFIG` — path to the YAML file. If unset, the agent uses `./tracksync-agent.config.local.yaml` when that file exists; otherwise `./tracksync-agent.config.yaml`.

Overrides are applied **after** merging remote config (see below), so env wins for secrets.

### Remote config

On startup the agent calls `GET {tracksync.apiUrl}/agent/config` with `Authorization: Bearer {token}`. If the response is valid JSON object, it is **deep-merged** over the YAML (remote wins). If the request fails or the body is invalid, the agent logs a warning and continues with local settings only.

Expected JSON shape is a partial document with optional `jira`, `tracksync`, and `sync` keys matching the YAML structure.

## Run with Docker

From this directory:

```bash
docker compose build
docker compose up -d
docker compose logs -f tracksync-agent
```

The compose file mounts `./tracksync-agent.config.yaml` into the container at `/app/tracksync-agent.config.yaml`.

## Run locally (development)

```bash
npm install
npm run dev
```

Production-style:

```bash
npm run build
npm start
```

## Get a TrackSync organization token

Use the TrackSync web app for your organization: open **Settings** (or **Organization** / **Integrations**, depending on your product version) and create or copy an **API token** used for server-to-server agents. Paste it into `tracksync.token` or set `TRACKSYNC_TOKEN`.

If your team has not enabled agent tokens yet, contact TrackSync support at support@tracksync.dev.

## Generate a Jira Data Center PAT

1. Sign in to your Jira Data Center instance.
2. Open your profile → **Personal Access Tokens** (location varies by version; see [Atlassian: Using personal access tokens](https://confluence.atlassian.com/enterprise/using-personal-access-tokens-1026032365.html)).
3. Create a token with permission to **browse** projects and issues the agent should read.
4. Put the token in `jira.pat` or `JIRA_PAT`.

The agent sends `Authorization: Bearer <pat>` to Jira’s REST API. If your server expects a different scheme, adjust the deployment or contact your Jira admin.

## API endpoints used

| Method | Path                       | Purpose                |
| ------ | -------------------------- | ---------------------- |
| `POST` | `{apiUrl}/ingest/jira`     | Issue batch ingest     |
| `POST` | `{apiUrl}/agent/heartbeat` | Liveness (every 60s)   |
| `GET`  | `{apiUrl}/agent/config`    | Optional remote config |

These routes must exist on the TrackSync API for full functionality.

## Behavior notes

- **First Jira sync** uses `updated >= -24h`. After a successful Jira search, later syncs use `updated >= -{pollIntervalMinutes}m`.
- **Scheduler**: `node-cron` runs each minute; a sync runs when `pollIntervalMinutes` has elapsed since the last scheduled run (supports any interval, not only divisors of 60).
- **Failures**: Jira errors skip the cycle; TrackSync ingest failures keep a **deduplicated in-memory queue** (capped at 5000 issues) for the next cycle.
- **Shutdown**: `SIGINT` / `SIGTERM` stop the cron job and heartbeat and exit.

## Logging

Lines look like:

```text
[2026-03-31T10:00:00Z] INFO  Agent started. Polling every 5 mins.
[2026-03-31T10:00:01Z] INFO  Fetched 23 issues from Jira.
[2026-03-31T10:00:02Z] INFO  ✅ Sent 23 issues to TrackSync.
```
