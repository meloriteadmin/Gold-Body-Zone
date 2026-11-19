ALTER TABLE "admin_profiles"
  ADD COLUMN "password_hash" TEXT,
  ADD COLUMN "password_changed_at" TIMESTAMP(3),
  ADD COLUMN "reset_token_hash" TEXT,
  ADD COLUMN "reset_expires_at" TIMESTAMP(3);

CREATE TABLE "admin_sessions" (
  "id" TEXT NOT NULL,
  "admin_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_sessions_token_hash_key" ON "admin_sessions"("token_hash");
CREATE INDEX "admin_sessions_admin_id_idx" ON "admin_sessions"("admin_id");
CREATE INDEX "admin_sessions_expires_at_idx" ON "admin_sessions"("expires_at");
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_profiles"("id") ON DELETE CASCADE;

DROP INDEX IF EXISTS "admin_profiles_auth_user_id_key";
ALTER TABLE "admin_profiles" DROP COLUMN IF EXISTS "auth_user_id";
