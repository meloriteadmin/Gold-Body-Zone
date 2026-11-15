-- AlterTable competitions
ALTER TABLE "competitions"
ADD COLUMN IF NOT EXISTS "is_registration_closed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "registration_closed_at" TIMESTAMP(3);

-- AlterTable registrations: make physical measurements nullable for Women's Competition & Open divisions
ALTER TABLE "registrations"
ALTER COLUMN "height_cm" DROP NOT NULL,
ALTER COLUMN "weight_kg" DROP NOT NULL;
