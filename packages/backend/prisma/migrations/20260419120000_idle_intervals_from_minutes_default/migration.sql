-- Align interval count with default idle_timeout_minutes (5 → 30 × 10s steps).
UPDATE "OrgSettings"
SET "idle_timeout_intervals" = GREATEST(1, ROUND(("idle_timeout_minutes" * 60.0) / 10)::integer);

ALTER TABLE "OrgSettings" ALTER COLUMN "idle_timeout_intervals" SET DEFAULT 30;
