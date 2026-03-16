-- Phase 3: local screenshot storage
CREATE TABLE IF NOT EXISTS local_screenshots (
  id              TEXT    PRIMARY KEY,
  session_id      TEXT    NOT NULL,
  local_path      TEXT    NOT NULL,
  taken_at        TEXT    NOT NULL,
  activity_score  REAL    NOT NULL DEFAULT 0,
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  synced          INTEGER NOT NULL DEFAULT 0,
  sync_attempts   INTEGER NOT NULL DEFAULT 0,
  last_sync_error TEXT,
  created_at      TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_local_screenshots_session ON local_screenshots (session_id);
CREATE INDEX IF NOT EXISTS idx_local_screenshots_synced  ON local_screenshots (synced, taken_at);

-- Phase 3: local activity log storage
CREATE TABLE IF NOT EXISTS local_activity_logs (
  id                TEXT    PRIMARY KEY,
  session_id        TEXT    NOT NULL,
  window_start      TEXT    NOT NULL,
  window_end        TEXT    NOT NULL,
  keyboard_events   INTEGER NOT NULL DEFAULT 0,
  mouse_clicks      INTEGER NOT NULL DEFAULT 0,
  mouse_distance_px INTEGER NOT NULL DEFAULT 0,
  active_app        TEXT,
  active_url        TEXT,
  activity_score    REAL    NOT NULL DEFAULT 0,
  synced            INTEGER NOT NULL DEFAULT 0,
  sync_attempts     INTEGER NOT NULL DEFAULT 0,
  last_sync_error   TEXT,
  created_at        TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_local_activity_session ON local_activity_logs (session_id);
CREATE INDEX IF NOT EXISTS idx_local_activity_synced  ON local_activity_logs (synced, window_start);
