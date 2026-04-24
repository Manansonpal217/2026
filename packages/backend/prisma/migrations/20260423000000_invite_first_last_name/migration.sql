-- Inviter-provided name parts; used as User.name when the invite is accepted.
ALTER TABLE "Invite" ADD COLUMN "first_name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Invite" ADD COLUMN "last_name" TEXT NOT NULL DEFAULT '';
