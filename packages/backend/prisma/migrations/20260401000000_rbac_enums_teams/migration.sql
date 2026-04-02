-- Migration: RBAC enums, role_version, Team/TeamMember, invited_by_id
-- This migration:
--   1. Creates Postgres enum types
--   2. Migrates existing string data to uppercase enum values
--   3. Alters columns to use the new enum types
--   4. Adds role_version, invited_by_id columns
--   5. Creates Team and TeamMember tables

-- ── Step 1: Create enum types ─────────────────────────────────────────────────

CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'VIEWER');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "OrgStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "OrgPlan" AS ENUM ('TRIAL', 'FREE', 'STANDARD', 'PROFESSIONAL');
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "InviteRole" AS ENUM ('ADMIN', 'MANAGER', 'EMPLOYEE', 'VIEWER');
CREATE TYPE "TeamRole" AS ENUM ('LEAD', 'MEMBER');

-- ── Step 2: Migrate existing data to uppercase before altering columns ─────────

-- User.role: super_admin → OWNER, admin → ADMIN, manager → MANAGER, employee → EMPLOYEE
UPDATE "User" SET role = 'OWNER'    WHERE role = 'super_admin';
UPDATE "User" SET role = 'ADMIN'    WHERE role = 'admin';
UPDATE "User" SET role = 'MANAGER'  WHERE role = 'manager';
UPDATE "User" SET role = 'EMPLOYEE' WHERE role = 'employee';
-- Any stragglers become EMPLOYEE
UPDATE "User" SET role = 'EMPLOYEE' WHERE role NOT IN ('OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'VIEWER');

-- User.status
UPDATE "User" SET status = 'ACTIVE'    WHERE status = 'active';
UPDATE "User" SET status = 'SUSPENDED' WHERE status = 'suspended';
UPDATE "User" SET status = 'ACTIVE'    WHERE status NOT IN ('ACTIVE', 'SUSPENDED');

-- Organization.status
UPDATE "Organization" SET status = 'ACTIVE'    WHERE status = 'active';
UPDATE "Organization" SET status = 'SUSPENDED' WHERE status = 'suspended';
UPDATE "Organization" SET status = 'ACTIVE'    WHERE status NOT IN ('ACTIVE', 'SUSPENDED');

-- Organization.plan
UPDATE "Organization" SET plan = 'TRIAL'        WHERE plan = 'trial';
UPDATE "Organization" SET plan = 'FREE'         WHERE plan = 'free';
UPDATE "Organization" SET plan = 'STANDARD'     WHERE plan = 'standard';
UPDATE "Organization" SET plan = 'PROFESSIONAL' WHERE plan = 'professional';
UPDATE "Organization" SET plan = 'TRIAL'        WHERE plan NOT IN ('TRIAL', 'FREE', 'STANDARD', 'PROFESSIONAL');

-- TimeSession.approval_status
UPDATE "TimeSession" SET approval_status = 'PENDING'  WHERE approval_status = 'pending';
UPDATE "TimeSession" SET approval_status = 'APPROVED' WHERE approval_status = 'approved';
UPDATE "TimeSession" SET approval_status = 'REJECTED' WHERE approval_status = 'rejected';
UPDATE "TimeSession" SET approval_status = 'PENDING'  WHERE approval_status NOT IN ('PENDING', 'APPROVED', 'REJECTED');

-- Invite.role
UPDATE "Invite" SET role = 'ADMIN'    WHERE role = 'admin';
UPDATE "Invite" SET role = 'MANAGER'  WHERE role = 'manager';
UPDATE "Invite" SET role = 'EMPLOYEE' WHERE role = 'employee';
UPDATE "Invite" SET role = 'VIEWER'   WHERE role = 'viewer';
UPDATE "Invite" SET role = 'EMPLOYEE' WHERE role NOT IN ('ADMIN', 'MANAGER', 'EMPLOYEE', 'VIEWER');

-- ── Step 3: Alter columns to use enum types ───────────────────────────────────

-- User
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole" USING (role::text::"UserRole");
ALTER TABLE "User" ALTER COLUMN "status" TYPE "UserStatus" USING (status::text::"UserStatus");
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'EMPLOYEE';
ALTER TABLE "User" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- Organization
ALTER TABLE "Organization" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Organization" ALTER COLUMN "plan" DROP DEFAULT;
ALTER TABLE "Organization" ALTER COLUMN "status" TYPE "OrgStatus" USING (status::text::"OrgStatus");
ALTER TABLE "Organization" ALTER COLUMN "plan" TYPE "OrgPlan" USING (plan::text::"OrgPlan");
ALTER TABLE "Organization" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
ALTER TABLE "Organization" ALTER COLUMN "plan" SET DEFAULT 'TRIAL';

-- TimeSession
ALTER TABLE "TimeSession" ALTER COLUMN "approval_status" DROP DEFAULT;
ALTER TABLE "TimeSession"
  ALTER COLUMN "approval_status" TYPE "ApprovalStatus" USING (approval_status::text::"ApprovalStatus");
ALTER TABLE "TimeSession" ALTER COLUMN "approval_status" SET DEFAULT 'PENDING';

-- Invite
ALTER TABLE "Invite" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "Invite" ALTER COLUMN "role" TYPE "InviteRole" USING (role::text::"InviteRole");
ALTER TABLE "Invite" ALTER COLUMN "role" SET DEFAULT 'EMPLOYEE';

-- ── Step 4: Add new columns ───────────────────────────────────────────────────

-- User.role_version
ALTER TABLE "User" ADD COLUMN "role_version" INTEGER NOT NULL DEFAULT 0;

-- Invite.invited_by_id (nullable first so existing rows survive, then we backfill)
ALTER TABLE "Invite" ADD COLUMN "invited_by_id" TEXT;

-- Backfill invited_by_id: point to the first OWNER/ADMIN in the same org
UPDATE "Invite" i
SET "invited_by_id" = (
  SELECT u.id FROM "User" u
  WHERE u.org_id = i.org_id
    AND u.role IN ('OWNER', 'ADMIN')
  ORDER BY u.created_at ASC
  LIMIT 1
);

-- Delete any invites that couldn't be backfilled (orphaned invites with no org admin)
DELETE FROM "Invite" WHERE "invited_by_id" IS NULL;

-- Now make it NOT NULL
ALTER TABLE "Invite" ALTER COLUMN "invited_by_id" SET NOT NULL;

-- Add FK constraint
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_invited_by_id_fkey"
  FOREIGN KEY ("invited_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Step 5: Create Team and TeamMember tables ─────────────────────────────────

CREATE TABLE "Team" (
  "id"         TEXT NOT NULL,
  "org_id"     TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "manager_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamMember" (
  "id"        TEXT NOT NULL,
  "team_id"   TEXT NOT NULL,
  "user_id"   TEXT NOT NULL,
  "team_role" "TeamRole" NOT NULL DEFAULT 'MEMBER',
  "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- FK constraints
ALTER TABLE "Team" ADD CONSTRAINT "Team_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Team" ADD CONSTRAINT "Team_manager_id_fkey"
  FOREIGN KEY ("manager_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_team_id_fkey"
  FOREIGN KEY ("team_id") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "Team_org_id_idx"         ON "Team"("org_id");
CREATE INDEX "Team_manager_id_idx"     ON "Team"("manager_id");
CREATE UNIQUE INDEX "TeamMember_team_id_user_id_key" ON "TeamMember"("team_id", "user_id");
CREATE INDEX "TeamMember_user_id_idx"  ON "TeamMember"("user_id");
