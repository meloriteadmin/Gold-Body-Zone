-- CreateEnum
CREATE TYPE "RepresentingType" AS ENUM ('GYM', 'INDIVIDUAL');

-- AlterTable
ALTER TABLE "registrations"
ADD COLUMN "representing_type" "RepresentingType" NOT NULL DEFAULT 'GYM',
ADD COLUMN "aadhaar_encrypted" TEXT,
ADD COLUMN "aadhaar_hash" TEXT,
ADD COLUMN "aadhaar_last4" TEXT,
ADD COLUMN "aadhaar_consent_at" TIMESTAMP(3),
ADD COLUMN "confirmation_email_sent_at" TIMESTAMP(3);
