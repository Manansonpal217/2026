-- Phase 2: local time sessions for offline-first sync
CREATE TABLE IF NOT EXISTS local_sessions (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL,
  org_id           TEXT NOT NULL,
  project_id       TEXT,
  task_id          TEXT,
  device_id        TEXT NOT NULL,
  device_name      TEXT NOT NULL,
  started_at       TEXT NOT NULL,
  ended_at         TEXT,
  duration_sec     INTEGER DEFAULT 0,
  is_manual        INTEGER DEFAULT 0,
  notes            TEXT,
  synced           INTEGER DEFAULT 0,
  sync_attempts    INTEGER DEFAULT 0,
  last_sync_error  TEXT,
  created_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_local_sessions_synced ON local_sessions(synced);
CREATE INDEX IF NOT EXISTS idx_local_sessions_user   ON local_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_local_sessions_started ON local_sessions(started_at DESC);
