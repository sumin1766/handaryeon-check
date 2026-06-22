
-- Seasons
CREATE TABLE public.seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seasons TO anon, authenticated;
GRANT ALL ON public.seasons TO service_role;
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_seasons" ON public.seasons FOR ALL USING (true) WITH CHECK (true);

-- Churches
CREATE TABLE public.churches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  denomination TEXT,
  contact_name TEXT,
  phone TEXT,
  memo TEXT,
  is_checked_in BOOLEAN NOT NULL DEFAULT false,
  checked_in_at TIMESTAMPTZ,
  actual_count INTEGER,
  source TEXT NOT NULL DEFAULT 'pre',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX churches_season_idx ON public.churches(season_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.churches TO anon, authenticated;
GRANT ALL ON public.churches TO service_role;
ALTER TABLE public.churches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_churches" ON public.churches FOR ALL USING (true) WITH CHECK (true);

-- Lodgings
CREATE TABLE public.lodgings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  building TEXT NOT NULL,
  floor TEXT,
  capacity INTEGER NOT NULL DEFAULT 0,
  gender TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lodgings_season_idx ON public.lodgings(season_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lodgings TO anon, authenticated;
GRANT ALL ON public.lodgings TO service_role;
ALTER TABLE public.lodgings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_lodgings" ON public.lodgings FOR ALL USING (true) WITH CHECK (true);

-- People
CREATE TABLE public.people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  note TEXT,
  gender TEXT NOT NULL,
  age_group TEXT NOT NULL,
  lodging BOOLEAN NOT NULL DEFAULT false,
  lodging_id UUID REFERENCES public.lodgings(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX people_church_idx ON public.people(church_id);
CREATE INDEX people_lodging_idx ON public.people(lodging_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people TO anon, authenticated;
GRANT ALL ON public.people TO service_role;
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_people" ON public.people FOR ALL USING (true) WITH CHECK (true);

-- Bath coupons
CREATE TABLE public.bath_coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  paid_transfer BOOLEAN NOT NULL DEFAULT false,
  transfer_at TIMESTAMPTZ,
  paid_cash BOOLEAN NOT NULL DEFAULT false,
  cash_at TIMESTAMPTZ,
  weekday TEXT,
  amount INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bath_coupons_season_idx ON public.bath_coupons(season_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bath_coupons TO anon, authenticated;
GRANT ALL ON public.bath_coupons TO service_role;
ALTER TABLE public.bath_coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_bath_coupons" ON public.bath_coupons FOR ALL USING (true) WITH CHECK (true);

-- App settings (per season)
CREATE TABLE public.app_settings (
  season_id UUID PRIMARY KEY REFERENCES public.seasons(id) ON DELETE CASCADE,
  bath_unit_price INTEGER NOT NULL DEFAULT 5000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_app_settings" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.seasons;
ALTER PUBLICATION supabase_realtime ADD TABLE public.churches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lodgings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.people;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bath_coupons;
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings;
