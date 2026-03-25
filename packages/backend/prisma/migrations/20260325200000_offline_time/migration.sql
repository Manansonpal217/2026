-- AlterTable
ALTER TABLE "OrgSettings" ADD COLUMN "allow_employee_offline_time" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "can_add_offline_time" BOOLEAN;

-- CreateTable
CREATE TABLE "OfflineTime" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "added_by_id" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineTime_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfflineTime_org_id_user_id_start_time_idx" ON "OfflineTime"("org_id", "user_id", "start_time");

-- CreateIndex
CREATE INDEX "OfflineTime_org_id_start_time_idx" ON "OfflineTime"("org_id", "start_time");

-- AddForeignKey
ALTER TABLE "OfflineTime" ADD CONSTRAINT "OfflineTime_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineTime" ADD CONSTRAINT "OfflineTime_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineTime" ADD CONSTRAINT "OfflineTime_added_by_id_fkey" FOREIGN KEY ("added_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
