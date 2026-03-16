-- AlterTable
ALTER TABLE "OrgSettings" ADD COLUMN     "idle_detection_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "idle_timeout_minutes" INTEGER NOT NULL DEFAULT 5;
