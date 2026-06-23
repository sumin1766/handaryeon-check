-- Restrict public read access to PII in churches and people tables.
-- Previously: anon could SELECT all rows (phone numbers, names, gender, age group).
-- Now: only authenticated users and service_role can read; writes also require auth.

-- churches
DROP POLICY IF EXISTS churches_select ON public.churches;
DROP POLICY IF EXISTS churches_insert ON public.churches;
DROP POLICY IF EXISTS churches_update ON public.churches;
DROP POLICY IF EXISTS churches_delete ON public.churches;

REVOKE ALL ON public.churches FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.churches TO authenticated;
GRANT ALL ON public.churches TO service_role;

CREATE POLICY churches_select ON public.churches FOR SELECT TO authenticated USING (true);
CREATE POLICY churches_insert ON public.churches FOR INSERT TO authenticated
  WITH CHECK (season_id IS NOT NULL AND name IS NOT NULL);
CREATE POLICY churches_update ON public.churches FOR UPDATE TO authenticated
  USING (season_id IS NOT NULL)
  WITH CHECK (season_id IS NOT NULL AND name IS NOT NULL);
CREATE POLICY churches_delete ON public.churches FOR DELETE TO authenticated
  USING (season_id IS NOT NULL);

-- people
DROP POLICY IF EXISTS people_select ON public.people;
DROP POLICY IF EXISTS people_insert ON public.people;
DROP POLICY IF EXISTS people_update ON public.people;
DROP POLICY IF EXISTS people_delete ON public.people;

REVOKE ALL ON public.people FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people TO authenticated;
GRANT ALL ON public.people TO service_role;

CREATE POLICY people_select ON public.people FOR SELECT TO authenticated USING (true);
CREATE POLICY people_insert ON public.people FOR INSERT TO authenticated
  WITH CHECK (church_id IS NOT NULL AND name IS NOT NULL);
CREATE POLICY people_update ON public.people FOR UPDATE TO authenticated
  USING (church_id IS NOT NULL)
  WITH CHECK (church_id IS NOT NULL AND name IS NOT NULL);
CREATE POLICY people_delete ON public.people FOR DELETE TO authenticated
  USING (church_id IS NOT NULL);