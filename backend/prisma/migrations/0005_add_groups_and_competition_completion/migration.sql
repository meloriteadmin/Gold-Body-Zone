-- AlterTable competitions
ALTER TABLE "competitions"
ADD COLUMN IF NOT EXISTS "is_completed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP(3);

-- CreateTable category_groups
CREATE TABLE IF NOT EXISTS "category_groups" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_groups_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "category_groups_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "competition_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "category_groups_category_id_sort_order_idx" ON "category_groups"("category_id", "sort_order");

-- AlterTable registrations
ALTER TABLE "registrations"
ADD COLUMN IF NOT EXISTS "group_id" TEXT,
ADD COLUMN IF NOT EXISTS "group_name" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'registrations_group_id_fkey'
  ) THEN
    ALTER TABLE "registrations"
    ADD CONSTRAINT "registrations_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "category_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "registrations_group_id_idx" ON "registrations"("group_id");

-- Update existing default competitions to MALE_ONLY
UPDATE "competitions"
SET "gender_eligibility" = 'MALE_ONLY'
WHERE "slug" IN ('bodybuilding', 'mens-physique', 'masters');
