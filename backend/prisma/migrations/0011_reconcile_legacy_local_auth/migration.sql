-- Forward-only repair for databases that recorded an older 0005_local_auth
-- migration without creating the session table. Preserve legacy auth IDs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_profiles' AND column_name = 'auth_user_id') THEN
    ALTER TABLE "admin_profiles" ALTER COLUMN "auth_user_id" DROP NOT NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "admin_sessions" (
  "id" TEXT NOT NULL,
  "admin_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "admin_sessions_token_hash_key" ON "admin_sessions"("token_hash");
CREATE INDEX IF NOT EXISTS "admin_sessions_admin_id_idx" ON "admin_sessions"("admin_id");
CREATE INDEX IF NOT EXISTS "admin_sessions_expires_at_idx" ON "admin_sessions"("expires_at");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_sessions_admin_id_fkey') THEN
    ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_fkey"
      FOREIGN KEY ("admin_id") REFERENCES "admin_profiles"("id") ON DELETE CASCADE;
  END IF;
END $$;
