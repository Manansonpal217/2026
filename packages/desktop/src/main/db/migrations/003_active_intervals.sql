-- Activity interval tracking: 10-second buckets with activity (mouse/keyboard)
-- interval_index = floor(timestampMs / 10000)
-- Pruned daily at startup to keep only current day
CREATE TABLE IF NOT EXISTS active_intervals (
  interval_index INTEGER PRIMARY KEY
);
