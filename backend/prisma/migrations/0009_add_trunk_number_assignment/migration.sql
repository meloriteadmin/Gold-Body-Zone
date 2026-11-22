-- AlterTable competitions
ALTER TABLE "competitions"
ADD COLUMN IF NOT EXISTS "trunk_numbers_assigned_at" TIMESTAMP(3);

-- AlterTable registrations
ALTER TABLE "registrations"
ADD COLUMN IF NOT EXISTS "trunk_number" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "registrations_competition_id_trunk_number_key" ON "registrations"("competition_id", "trunk_number");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "registrations_competition_id_trunk_number_idx" ON "registrations"("competition_id", "trunk_number");
