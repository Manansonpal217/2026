-- Global email uniqueness: remove duplicate User rows (same lower(email)), then replace composite unique with unique on email alone.
-- Keeper per email: platform admin first, else oldest by (created_at, id). See plan "Global platform email uniqueness".

CREATE TEMP TABLE _dup_user_ids ON COMMIT DROP AS
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY lower("email")
           ORDER BY CASE WHEN "is_platform_admin" THEN 0 ELSE 1 END, "created_at", id
         ) AS rn
  FROM "User"
)
SELECT id FROM ranked WHERE rn > 1;

DELETE FROM "RefreshToken" WHERE "user_id" IN (SELECT id FROM _dup_user_ids);

DELETE FROM "SessionTimeDeduction"
WHERE "session_id" IN (SELECT id FROM "TimeSession" WHERE "user_id" IN (SELECT id FROM _dup_user_ids));

DELETE FROM "ActivityLog"
WHERE "session_id" IN (SELECT id FROM "TimeSession" WHERE "user_id" IN (SELECT id FROM _dup_user_ids));

DELETE FROM "Screenshot"
WHERE "session_id" IN (SELECT id FROM "TimeSession" WHERE "user_id" IN (SELECT id FROM _dup_user_ids));

DELETE FROM "TimeSession" WHERE "user_id" IN (SELECT id FROM _dup_user_ids);

DELETE FROM "Screenshot" WHERE "user_id" IN (SELECT id FROM _dup_user_ids);

DELETE FROM "ActivityLog" WHERE "user_id" IN (SELECT id FROM _dup_user_ids);

DELETE FROM "OfflineTime"
WHERE "user_id" IN (SELECT id FROM _dup_user_ids)
   OR "requested_by_id" IN (SELECT id FROM _dup_user_ids)
   OR "approver_id" IN (SELECT id FROM _dup_user_ids);

DELETE FROM "AuditLog" WHERE "actor_id" IN (SELECT id FROM _dup_user_ids);

DELETE FROM "Invite" WHERE "invited_by_id" IN (SELECT id FROM _dup_user_ids);

DELETE FROM "AgentCommand" WHERE "user_id" IN (SELECT id FROM _dup_user_ids);

UPDATE "User" SET "manager_id" = NULL WHERE "manager_id" IN (SELECT id FROM _dup_user_ids);

DELETE FROM "User" WHERE id IN (SELECT id FROM _dup_user_ids);

DROP INDEX IF EXISTS "User_email_org_id_key";

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
