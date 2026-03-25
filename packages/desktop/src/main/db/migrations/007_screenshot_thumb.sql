ALTER TABLE local_screenshots ADD COLUMN thumb_local_path TEXT;
ALTER TABLE local_screenshots ADD COLUMN thumb_file_size_bytes INTEGER NOT NULL DEFAULT 0;
