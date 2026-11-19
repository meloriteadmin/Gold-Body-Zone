ALTER TABLE "admin_sessions" DROP CONSTRAINT IF EXISTS "admin_sessions_admin_id_fkey";
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_fkey"
  FOREIGN KEY ("admin_id") REFERENCES "admin_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "category_groups" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "competition_photos" ALTER COLUMN "updated_at" DROP DEFAULT;
