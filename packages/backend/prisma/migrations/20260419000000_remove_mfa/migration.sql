-- Remove MFA columns from OrgSettings
ALTER TABLE "OrgSettings" DROP COLUMN IF EXISTS "mfa_required_for_admins";
ALTER TABLE "OrgSettings" DROP COLUMN IF EXISTS "mfa_required_for_managers";

-- Remove MFA columns from User
ALTER TABLE "User" DROP COLUMN IF EXISTS "mfa_enabled";
ALTER TABLE "User" DROP COLUMN IF EXISTS "mfa_secret";
ALTER TABLE "User" DROP COLUMN IF EXISTS "mfa_secret_encrypted";
ALTER TABLE "User" DROP COLUMN IF EXISTS "mfa_backup_codes";
