-- CreateTable judges
CREATE TABLE IF NOT EXISTS "judges" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "designation" TEXT DEFAULT 'Judge',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "judges_pkey" PRIMARY KEY ("id")
);

-- CreateTable judging_sessions
CREATE TABLE IF NOT EXISTS "judging_sessions" (
    "id" TEXT NOT NULL,
    "competition_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "judging_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable judge_semifinalist_selections
CREATE TABLE IF NOT EXISTS "judge_semifinalist_selections" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "judge_id" TEXT NOT NULL,
    "registration_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "group_id" TEXT,
    "group_key" TEXT NOT NULL DEFAULT 'DEFAULT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "judge_semifinalist_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable judge_rankings
CREATE TABLE IF NOT EXISTS "judge_rankings" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "judge_id" TEXT NOT NULL,
    "registration_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "group_id" TEXT,
    "group_key" TEXT NOT NULL DEFAULT 'DEFAULT',
    "rank" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "judge_rankings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "judging_sessions_token_key" ON "judging_sessions"("token");
CREATE INDEX IF NOT EXISTS "judging_sessions_token_idx" ON "judging_sessions"("token");
CREATE INDEX IF NOT EXISTS "judging_sessions_competition_id_idx" ON "judging_sessions"("competition_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "judge_semifinalist_selections_session_id_judge_id_registration_id_key" ON "judge_semifinalist_selections"("session_id", "judge_id", "registration_id");
CREATE INDEX IF NOT EXISTS "judge_semifinalist_selections_session_id_judge_id_category_id_group_key_idx" ON "judge_semifinalist_selections"("session_id", "judge_id", "category_id", "group_key");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "judge_rankings_session_id_judge_id_registration_id_key" ON "judge_rankings"("session_id", "judge_id", "registration_id");
CREATE UNIQUE INDEX IF NOT EXISTS "judge_rankings_session_id_judge_id_category_id_group_key_rank_key" ON "judge_rankings"("session_id", "judge_id", "category_id", "group_key", "rank");
CREATE INDEX IF NOT EXISTS "judge_rankings_session_id_judge_id_category_id_group_key_idx" ON "judge_rankings"("session_id", "judge_id", "category_id", "group_key");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'judging_sessions_competition_id_fkey') THEN
        ALTER TABLE "judging_sessions" ADD CONSTRAINT "judging_sessions_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'judge_semifinalist_selections_session_id_fkey') THEN
        ALTER TABLE "judge_semifinalist_selections" ADD CONSTRAINT "judge_semifinalist_selections_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "judging_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'judge_semifinalist_selections_judge_id_fkey') THEN
        ALTER TABLE "judge_semifinalist_selections" ADD CONSTRAINT "judge_semifinalist_selections_judge_id_fkey" FOREIGN KEY ("judge_id") REFERENCES "judges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'judge_semifinalist_selections_registration_id_fkey') THEN
        ALTER TABLE "judge_semifinalist_selections" ADD CONSTRAINT "judge_semifinalist_selections_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'judge_rankings_session_id_fkey') THEN
        ALTER TABLE "judge_rankings" ADD CONSTRAINT "judge_rankings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "judging_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'judge_rankings_judge_id_fkey') THEN
        ALTER TABLE "judge_rankings" ADD CONSTRAINT "judge_rankings_judge_id_fkey" FOREIGN KEY ("judge_id") REFERENCES "judges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'judge_rankings_registration_id_fkey') THEN
        ALTER TABLE "judge_rankings" ADD CONSTRAINT "judge_rankings_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
