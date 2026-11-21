-- AlterTable judge_rankings
ALTER TABLE "judge_rankings" ADD COLUMN IF NOT EXISTS "title" TEXT;

-- CreateTable judge_category_submissions
CREATE TABLE IF NOT EXISTS "judge_category_submissions" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "judge_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "group_key" TEXT NOT NULL DEFAULT 'DEFAULT',
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "judge_category_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "judge_category_submissions_session_id_judge_id_category_id_group_key_key" ON "judge_category_submissions"("session_id", "judge_id", "category_id", "group_key");
CREATE INDEX IF NOT EXISTS "judge_category_submissions_session_id_judge_id_category_id_idx" ON "judge_category_submissions"("session_id", "judge_id", "category_id");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'judge_category_submissions_session_id_fkey') THEN
        ALTER TABLE "judge_category_submissions" ADD CONSTRAINT "judge_category_submissions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "judging_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'judge_category_submissions_judge_id_fkey') THEN
        ALTER TABLE "judge_category_submissions" ADD CONSTRAINT "judge_category_submissions_judge_id_fkey" FOREIGN KEY ("judge_id") REFERENCES "judges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
