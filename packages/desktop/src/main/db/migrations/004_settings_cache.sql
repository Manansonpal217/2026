-- Settings cache for org-level feature flags (Docs/app/02-settings-sync-feature-flags.md)
CREATE TABLE IF NOT EXISTS settings_cache (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  INTEGER NOT NULL,
  synced_at   INTEGER
);
