-- CreateTable
CREATE TABLE "SessionTimeDeduction" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "range_start" TIMESTAMP(3) NOT NULL,
    "range_end" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'screenshot_deleted',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionTimeDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionTimeDeduction_session_id_idx" ON "SessionTimeDeduction"("session_id");

-- CreateIndex
CREATE INDEX "SessionTimeDeduction_org_id_session_id_idx" ON "SessionTimeDeduction"("org_id", "session_id");

-- AddForeignKey
ALTER TABLE "SessionTimeDeduction" ADD CONSTRAINT "SessionTimeDeduction_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "TimeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
