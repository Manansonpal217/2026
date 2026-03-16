-- CreateTable
CREATE TABLE "Screenshot" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "taken_at" TIMESTAMP(3) NOT NULL,
    "activity_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "is_blurred" BOOLEAN NOT NULL DEFAULT false,
    "file_size_bytes" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Screenshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "window_end" TIMESTAMP(3) NOT NULL,
    "keyboard_events" INTEGER NOT NULL DEFAULT 0,
    "mouse_clicks" INTEGER NOT NULL DEFAULT 0,
    "mouse_distance_px" INTEGER NOT NULL DEFAULT 0,
    "active_app" TEXT,
    "active_url" TEXT,
    "activity_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Screenshot_s3_key_key" ON "Screenshot"("s3_key");

-- CreateIndex
CREATE INDEX "Screenshot_user_id_taken_at_idx" ON "Screenshot"("user_id", "taken_at");

-- CreateIndex
CREATE INDEX "Screenshot_org_id_taken_at_idx" ON "Screenshot"("org_id", "taken_at");

-- CreateIndex
CREATE INDEX "Screenshot_session_id_idx" ON "Screenshot"("session_id");

-- CreateIndex
CREATE INDEX "ActivityLog_user_id_window_start_idx" ON "ActivityLog"("user_id", "window_start");

-- CreateIndex
CREATE INDEX "ActivityLog_session_id_idx" ON "ActivityLog"("session_id");

-- CreateIndex
CREATE INDEX "ActivityLog_org_id_window_start_idx" ON "ActivityLog"("org_id", "window_start");

-- AddForeignKey
ALTER TABLE "Screenshot" ADD CONSTRAINT "Screenshot_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "TimeSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Screenshot" ADD CONSTRAINT "Screenshot_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "TimeSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
