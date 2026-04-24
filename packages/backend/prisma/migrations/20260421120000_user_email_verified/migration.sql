-- Email verification gate for login; column was in Prisma schema but missing from earlier migrations.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "email_verified" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ALTER COLUMN "email_verified" SET DEFAULT false;
