CREATE TABLE public.church_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  church_id uuid NOT NULL UNIQUE REFERENCES public.churches(id) ON DELETE CASCADE,
  season_id uuid NOT NULL,
  paid_transfer boolean NOT NULL DEFAULT false,
  transfer_at timestamptz,
  paid_cash boolean NOT NULL DEFAULT false,
  cash_at timestamptz,
  amount integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.church_payments TO anon, authenticated;
GRANT ALL ON public.church_payments TO service_role;

ALTER TABLE public.church_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "church_payments select" ON public.church_payments
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "church_payments insert" ON public.church_payments
  FOR INSERT TO anon, authenticated WITH CHECK (season_id IS NOT NULL AND church_id IS NOT NULL);
CREATE POLICY "church_payments update" ON public.church_payments
  FOR UPDATE TO anon, authenticated USING (season_id IS NOT NULL) WITH CHECK (season_id IS NOT NULL);
CREATE POLICY "church_payments delete" ON public.church_payments
  FOR DELETE TO anon, authenticated USING (season_id IS NOT NULL);

CREATE INDEX church_payments_season_idx ON public.church_payments(season_id);