-- Sync resilience: track when we last attempted sync for exponential backoff and stale recovery
ALTER TABLE local_sessions ADD COLUMN last_sync_attempt_at TEXT;
ALTER TABLE local_screenshots ADD COLUMN last_sync_attempt_at TEXT;
ALTER TABLE local_activity_logs ADD COLUMN last_sync_attempt_at TEXT;
