-- Enable Row Level Security across all application tables
ALTER TABLE "admin_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "competitions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "competition_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "registrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;

-- Admin Profiles: authenticated users may read/update only their own active profile
-- (Role escalation & deactivation are blocked by column/policy constraints and backend API)
DROP POLICY IF EXISTS "admin_profiles_select_own" ON "admin_profiles";
CREATE POLICY "admin_profiles_select_own"
  ON "admin_profiles"
  FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid()::text AND is_active = true);

DROP POLICY IF EXISTS "admin_profiles_update_own" ON "admin_profiles";
CREATE POLICY "admin_profiles_update_own"
  ON "admin_profiles"
  FOR UPDATE
  TO authenticated
  USING (auth_user_id = auth.uid()::text AND is_active = true)
  WITH CHECK (auth_user_id = auth.uid()::text AND is_active = true);

-- Competitions: public / anonymous users can read ONLY published competitions
DROP POLICY IF EXISTS "competitions_public_read_published" ON "competitions";
CREATE POLICY "competitions_public_read_published"
  ON "competitions"
  FOR SELECT
  TO anon, authenticated
  USING (is_published = true);

-- Competitions: active admins can perform full CRUD
DROP POLICY IF EXISTS "competitions_admin_all" ON "competitions";
CREATE POLICY "competitions_admin_all"
  ON "competitions"
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "admin_profiles" ap
      WHERE ap.auth_user_id = auth.uid()::text
        AND ap.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "admin_profiles" ap
      WHERE ap.auth_user_id = auth.uid()::text
        AND ap.is_active = true
    )
  );

-- Competition Categories: public can read categories ONLY for published competitions
DROP POLICY IF EXISTS "competition_categories_public_read_published" ON "competition_categories";
CREATE POLICY "competition_categories_public_read_published"
  ON "competition_categories"
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "competitions" c
      WHERE c.id = competition_id
        AND c.is_published = true
    )
  );

-- Competition Categories: active admins can perform full CRUD
DROP POLICY IF EXISTS "competition_categories_admin_all" ON "competition_categories";
CREATE POLICY "competition_categories_admin_all"
  ON "competition_categories"
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "admin_profiles" ap
      WHERE ap.auth_user_id = auth.uid()::text
        AND ap.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "admin_profiles" ap
      WHERE ap.auth_user_id = auth.uid()::text
        AND ap.is_active = true
    )
  );

-- Registrations: ONLY active admins can read registrations via Supabase / Realtime
DROP POLICY IF EXISTS "registrations_admin_select" ON "registrations";
CREATE POLICY "registrations_admin_select"
  ON "registrations"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "admin_profiles" ap
      WHERE ap.auth_user_id = auth.uid()::text
        AND ap.is_active = true
    )
  );

-- Payments: ONLY active admins can read payment records via Supabase / Realtime
DROP POLICY IF EXISTS "payments_admin_select" ON "payments";
CREATE POLICY "payments_admin_select"
  ON "payments"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "admin_profiles" ap
      WHERE ap.auth_user_id = auth.uid()::text
        AND ap.is_active = true
    )
  );

-- Supabase Realtime publication for registrations and payments
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'registrations'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE "registrations";
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'payments'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE "payments";
    END IF;
  END IF;
END $$;
