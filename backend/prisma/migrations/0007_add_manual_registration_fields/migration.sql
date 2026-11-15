-- AlterTable registrations
ALTER TABLE "registrations"
ADD COLUMN IF NOT EXISTS "is_manual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "payment_method" TEXT;
