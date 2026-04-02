-- AlterTable
ALTER TABLE "OrgSettings" ADD COLUMN     "jira_projects" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "jira_issue_types" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "jira_statuses" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "jira_time_logging_method" TEXT NOT NULL DEFAULT 'jira_worklog';

-- CreateTable
CREATE TABLE "AgentToken" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "name" TEXT,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentCommand" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "locked_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentHeartbeat" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "agent_version" TEXT,
    "status" TEXT NOT NULL DEFAULT 'online',
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_sync_at" TIMESTAMP(3),
    "last_sync_count" INTEGER,

    CONSTRAINT "AgentHeartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JiraIssue" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "jira_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "summary" TEXT,
    "status" TEXT,
    "assignee_email" TEXT,
    "priority" TEXT,
    "due_date" TIMESTAMP(3),
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "raw_payload" JSONB NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JiraIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentToken_token_hash_key" ON "AgentToken"("token_hash");

-- CreateIndex
CREATE INDEX "AgentToken_org_id_idx" ON "AgentToken"("org_id");

-- CreateIndex
CREATE INDEX "AgentCommand_org_id_status_idx" ON "AgentCommand"("org_id", "status");

-- CreateIndex
CREATE INDEX "AgentCommand_org_id_created_at_idx" ON "AgentCommand"("org_id", "created_at");

-- CreateIndex
CREATE INDEX "AgentCommand_status_locked_at_idx" ON "AgentCommand"("status", "locked_at");

-- CreateIndex
CREATE UNIQUE INDEX "AgentHeartbeat_org_id_key" ON "AgentHeartbeat"("org_id");

-- CreateIndex
CREATE INDEX "JiraIssue_org_id_idx" ON "JiraIssue"("org_id");

-- CreateIndex
CREATE INDEX "JiraIssue_org_id_assignee_email_idx" ON "JiraIssue"("org_id", "assignee_email");

-- CreateIndex
CREATE UNIQUE INDEX "JiraIssue_org_id_jira_id_key" ON "JiraIssue"("org_id", "jira_id");

-- AddForeignKey
ALTER TABLE "AgentToken" ADD CONSTRAINT "AgentToken_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentCommand" ADD CONSTRAINT "AgentCommand_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentCommand" ADD CONSTRAINT "AgentCommand_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentHeartbeat" ADD CONSTRAINT "AgentHeartbeat_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JiraIssue" ADD CONSTRAINT "JiraIssue_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
