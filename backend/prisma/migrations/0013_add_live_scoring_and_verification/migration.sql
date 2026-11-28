-- Additive, idempotent migration: live round-based scoring + participant verification.
-- Does NOT modify or drop any existing data.

ALTER TABLE "registrations" ADD COLUMN IF NOT EXISTS "verified_at" TIMESTAMP(3);

ALTER TABLE "competition_judges" ADD COLUMN IF NOT EXISTS "access_token" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "competition_judges_access_token_key" ON "competition_judges"("access_token");

CREATE TABLE IF NOT EXISTS "live_heats" (
    "id" TEXT NOT NULL,
    "competition_id" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "category_id" TEXT,
    "group_id" TEXT,
    "parent_heat_id" TEXT,
    "is_tiebreak" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "label" TEXT,
    "selection_limit" INTEGER,
    "participant_ids" JSONB NOT NULL DEFAULT '[]',
    "titles" JSONB NOT NULL DEFAULT '[]',
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "live_heats_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "live_heats_competition_id_round_idx" ON "live_heats"("competition_id", "round");
CREATE INDEX IF NOT EXISTS "live_heats_competition_id_status_idx" ON "live_heats"("competition_id", "status");

CREATE TABLE IF NOT EXISTS "live_heat_submissions" (
    "id" TEXT NOT NULL,
    "heat_id" TEXT NOT NULL,
    "judge_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "live_heat_submissions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "live_heat_submissions_heat_id_judge_id_key" ON "live_heat_submissions"("heat_id", "judge_id");
CREATE INDEX IF NOT EXISTS "live_heat_submissions_heat_id_idx" ON "live_heat_submissions"("heat_id");

CREATE TABLE IF NOT EXISTS "live_competition_states" (
    "id" TEXT NOT NULL,
    "competition_id" TEXT NOT NULL,
    "round1_qualifiers" JSONB NOT NULL DEFAULT '{}',
    "title_awards" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "live_competition_states_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "live_competition_states_competition_id_key" ON "live_competition_states"("competition_id");

DO $$ BEGIN
  ALTER TABLE "live_heats" ADD CONSTRAINT "live_heats_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "live_heat_submissions" ADD CONSTRAINT "live_heat_submissions_heat_id_fkey" FOREIGN KEY ("heat_id") REFERENCES "live_heats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "live_heat_submissions" ADD CONSTRAINT "live_heat_submissions_judge_id_fkey" FOREIGN KEY ("judge_id") REFERENCES "judges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "live_competition_states" ADD CONSTRAINT "live_competition_states_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
