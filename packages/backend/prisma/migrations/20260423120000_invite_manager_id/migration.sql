-- Line manager chosen at invite time for employees; applied as User.manager_id on accept.
ALTER TABLE "Invite" ADD COLUMN "manager_id" TEXT;
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
