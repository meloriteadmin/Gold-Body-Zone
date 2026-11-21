-- AlterTable judges: add competition_id
ALTER TABLE "judges" ADD COLUMN IF NOT EXISTS "competition_id" TEXT;
CREATE INDEX IF NOT EXISTS "judges_competition_id_idx" ON "judges"("competition_id");

-- CreateTable competition_judges
CREATE TABLE IF NOT EXISTS "competition_judges" (
    "id" TEXT NOT NULL,
    "competition_id" TEXT NOT NULL,
    "judge_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competition_judges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "competition_judges_competition_id_judge_id_key" ON "competition_judges"("competition_id", "judge_id");
CREATE INDEX IF NOT EXISTS "competition_judges_competition_id_idx" ON "competition_judges"("competition_id");
CREATE INDEX IF NOT EXISTS "competition_judges_judge_id_idx" ON "competition_judges"("judge_id");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'judges_competition_id_fkey') THEN
        ALTER TABLE "judges" ADD CONSTRAINT "judges_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'competition_judges_competition_id_fkey') THEN
        ALTER TABLE "competition_judges" ADD CONSTRAINT "competition_judges_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'competition_judges_judge_id_fkey') THEN
        ALTER TABLE "competition_judges" ADD CONSTRAINT "competition_judges_judge_id_fkey" FOREIGN KEY ("judge_id") REFERENCES "judges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
