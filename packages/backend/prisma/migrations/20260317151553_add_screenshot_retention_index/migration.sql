-- CreateIndex
CREATE INDEX "Screenshot_org_id_deleted_at_taken_at_idx" ON "Screenshot"("org_id", "deleted_at", "taken_at");
