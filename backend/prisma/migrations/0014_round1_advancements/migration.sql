ALTER TABLE "live_competition_states"
ADD COLUMN "round1_advancements" JSONB NOT NULL DEFAULT '{}';
