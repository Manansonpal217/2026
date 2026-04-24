-- Platform super admins must not belong to an organization.
UPDATE "User" SET org_id = NULL, manager_id = NULL WHERE is_platform_admin = true;

ALTER TABLE "User" ADD CONSTRAINT "User_platform_admin_no_org_chk"
  CHECK (NOT is_platform_admin OR org_id IS NULL);
