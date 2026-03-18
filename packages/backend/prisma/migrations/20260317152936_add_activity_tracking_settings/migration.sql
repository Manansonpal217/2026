-- AlterTable
ALTER TABLE "OrgSettings" ADD COLUMN     "track_app_usage" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "track_keyboard" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "track_mouse" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "track_url" BOOLEAN NOT NULL DEFAULT false;
