
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['churches','people','lodgings','bath_coupons','app_settings','seasons','receipt_layout'];
  pol record;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- drop all existing policies
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('CREATE POLICY "Allow all select on %1$I" ON public.%1$I FOR SELECT TO anon, authenticated USING (true)', t);
    EXECUTE format('CREATE POLICY "Allow all insert on %1$I" ON public.%1$I FOR INSERT TO anon, authenticated WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "Allow all update on %1$I" ON public.%1$I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "Allow all delete on %1$I" ON public.%1$I FOR DELETE TO anon, authenticated USING (true)', t);
  END LOOP;
END $$;
