-- Update existing orgs to use 60 seconds (was 300)
UPDATE "OrgSettings" SET "screenshot_interval_seconds" = 60 WHERE "screenshot_interval_seconds" = 300;
