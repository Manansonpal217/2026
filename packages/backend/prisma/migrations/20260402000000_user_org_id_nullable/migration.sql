-- AlterTable: make org_id nullable for platform admin users (no org association)
ALTER TABLE "User" ALTER COLUMN "org_id" DROP NOT NULL;
