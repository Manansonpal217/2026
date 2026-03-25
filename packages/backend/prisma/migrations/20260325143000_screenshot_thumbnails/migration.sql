-- AlterTable
ALTER TABLE "Screenshot" ADD COLUMN "thumb_s3_key" TEXT;
ALTER TABLE "Screenshot" ADD COLUMN "thumb_file_size_bytes" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "Screenshot_thumb_s3_key_key" ON "Screenshot"("thumb_s3_key");
