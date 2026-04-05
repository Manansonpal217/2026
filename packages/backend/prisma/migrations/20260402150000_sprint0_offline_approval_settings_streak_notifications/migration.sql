-- Sprint 0: Organization.timezone, OfflineTime approval workflow, UserSettingsOverride, Streak, Notification

-- CreateEnum
CREATE TYPE "OfflineTimeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');
CREATE TYPE "OfflineTimeSource" AS ENUM ('REQUEST', 'DIRECT_ADD');
CREATE TYPE "NotificationType" AS ENUM (
  'OFFLINE_TIME_SUBMITTED',
  'OFFLINE_TIME_APPROVED',
  'OFFLINE_TIME_REJECTED',
  'OFFLINE_TIME_EXPIRED',
  'OFFLINE_TIME_ALREADY_RESOLVED',
  'PAYMENT_DUE'
);

-- AlterTable Organization
ALTER TABLE "Organization" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC';

-- AlterTable OfflineTime (destructive reshape; backfill before NOT NULL)
ALTER TABLE "OfflineTime" RENAME COLUMN "added_by_id" TO "requested_by_id";

ALTER TABLE "OfflineTime"
  ADD COLUMN "approver_id" TEXT,
  ADD COLUMN "source" "OfflineTimeSource",
  ADD COLUMN "status" "OfflineTimeStatus",
  ADD COLUMN "approver_note" TEXT,
  ADD COLUMN "expires_at" TIMESTAMP(3);

UPDATE "OfflineTime" SET
  "source" = CASE
    WHEN "user_id" = "requested_by_id" THEN 'REQUEST'::"OfflineTimeSource"
    ELSE 'DIRECT_ADD'::"OfflineTimeSource"
  END,
  "status" = 'APPROVED'::"OfflineTimeStatus",
  "approver_id" = "requested_by_id";

ALTER TABLE "OfflineTime" ALTER COLUMN "source" SET NOT NULL;
ALTER TABLE "OfflineTime" ALTER COLUMN "source" SET DEFAULT 'REQUEST';
ALTER TABLE "OfflineTime" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "OfflineTime" ALTER COLUMN "status" SET DEFAULT 'PENDING';

ALTER TABLE "OfflineTime"
  ADD CONSTRAINT "OfflineTime_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX IF EXISTS "OfflineTime_org_id_start_time_idx";

CREATE INDEX "OfflineTime_org_id_status_idx" ON "OfflineTime"("org_id", "status");
CREATE INDEX "OfflineTime_status_expires_at_idx" ON "OfflineTime"("status", "expires_at");

-- CreateTable UserSettingsOverride
CREATE TABLE "UserSettingsOverride" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "feature_key" VARCHAR(100) NOT NULL,
  "value" TEXT NOT NULL,
  CONSTRAINT "UserSettingsOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserSettingsOverride_org_id_user_id_feature_key_key" ON "UserSettingsOverride"("org_id", "user_id", "feature_key");
CREATE INDEX "UserSettingsOverride_org_id_user_id_idx" ON "UserSettingsOverride"("org_id", "user_id");

ALTER TABLE "UserSettingsOverride"
  ADD CONSTRAINT "UserSettingsOverride_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable Streak
CREATE TABLE "Streak" (
  "user_id" TEXT NOT NULL,
  "current_streak" INTEGER NOT NULL DEFAULT 0,
  "longest_streak" INTEGER NOT NULL DEFAULT 0,
  "last_active_date" TIMESTAMP(3),
  CONSTRAINT "Streak_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "Streak"
  ADD CONSTRAINT "Streak_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable Notification
CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "payload" JSONB NOT NULL,
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_user_id_read_at_created_at_idx" ON "Notification"("user_id", "read_at", "created_at");
CREATE INDEX "Notification_org_id_created_at_idx" ON "Notification"("org_id", "created_at");

CREATE INDEX "Notification_user_unread_idx" ON "Notification"("user_id", "created_at") WHERE "read_at" IS NULL;

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
