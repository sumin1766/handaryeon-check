-- Restore anon access for app tables (shared-password gate model)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seasons TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.churches TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lodgings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bath_coupons TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipt_layout TO anon;

-- Ensure RLS policies allow anon role too (re-create as PERMISSIVE TO anon, authenticated)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['seasons','churches','people','lodgings','bath_coupons','app_settings','receipt_layout']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_anon_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
      t || '_anon_all', t
    );
  END LOOP;
END $$;
