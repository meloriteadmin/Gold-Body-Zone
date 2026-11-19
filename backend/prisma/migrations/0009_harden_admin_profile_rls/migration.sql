DROP POLICY IF EXISTS "admin_profiles_update_own" ON "admin_profiles";
DROP POLICY IF EXISTS "admin_profiles_select_own" ON "admin_profiles";
ALTER TABLE "admin_profiles" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "registrations_admin_select" ON "registrations";
DROP POLICY IF EXISTS "payments_admin_select" ON "payments";
ALTER TABLE "registrations" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" DISABLE ROW LEVEL SECURITY;
