ALTER TABLE "registrations"
ADD COLUMN IF NOT EXISTS "acknowledgement_email_sent_at" TIMESTAMP(3);
