-- AlterTable (TEXT to match "User"."id"; Prisma String @id is not PostgreSQL UUID in this schema)
ALTER TABLE "User" ADD COLUMN "manager_id" TEXT;

-- CreateIndex
CREATE INDEX "User_manager_id_idx" ON "User"("manager_id");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
