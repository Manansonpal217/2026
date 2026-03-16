-- CreateIndex
CREATE INDEX "Invite_org_id_idx" ON "Invite"("org_id");

-- CreateIndex
CREATE INDEX "Invite_email_org_id_idx" ON "Invite"("email", "org_id");

-- CreateIndex
CREATE INDEX "Invite_org_id_accepted_at_expires_at_idx" ON "Invite"("org_id", "accepted_at", "expires_at");

-- CreateIndex
CREATE INDEX "Project_org_id_idx" ON "Project"("org_id");

-- CreateIndex
CREATE INDEX "Project_org_id_archived_idx" ON "Project"("org_id", "archived");

-- CreateIndex
CREATE INDEX "RefreshToken_user_id_idx" ON "RefreshToken"("user_id");

-- CreateIndex
CREATE INDEX "RefreshToken_user_id_expires_at_idx" ON "RefreshToken"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "Task_project_id_idx" ON "Task"("project_id");

-- CreateIndex
CREATE INDEX "Task_project_id_status_idx" ON "Task"("project_id", "status");

-- CreateIndex
CREATE INDEX "Task_org_id_idx" ON "Task"("org_id");

-- CreateIndex
CREATE INDEX "User_org_id_idx" ON "User"("org_id");

-- CreateIndex
CREATE INDEX "User_org_id_status_idx" ON "User"("org_id", "status");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");
