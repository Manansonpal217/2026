-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "assignee_user_id" TEXT;

-- CreateIndex
CREATE INDEX "Task_assignee_user_id_idx" ON "Task"("assignee_user_id");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
