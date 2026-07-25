CREATE TABLE public.duplicate_dismissals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  season_id uuid NOT NULL,
  church_a_id uuid NOT NULL,
  church_b_id uuid NOT NULL,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT duplicate_dismissals_ordered CHECK (church_a_id < church_b_id),
  CONSTRAINT duplicate_dismissals_unique UNIQUE (season_id, church_a_id, church_b_id)
);
CREATE INDEX duplicate_dismissals_season_idx ON public.duplicate_dismissals(season_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.duplicate_dismissals TO anon, authenticated;
GRANT ALL ON public.duplicate_dismissals TO service_role;
ALTER TABLE public.duplicate_dismissals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "duplicate_dismissals select" ON public.duplicate_dismissals FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "duplicate_dismissals insert" ON public.duplicate_dismissals FOR INSERT TO anon, authenticated WITH CHECK (season_id IS NOT NULL AND church_a_id IS NOT NULL AND church_b_id IS NOT NULL AND church_a_id < church_b_id);
CREATE POLICY "duplicate_dismissals update" ON public.duplicate_dismissals FOR UPDATE TO anon, authenticated USING (season_id IS NOT NULL) WITH CHECK (season_id IS NOT NULL);
CREATE POLICY "duplicate_dismissals delete" ON public.duplicate_dismissals FOR DELETE TO anon, authenticated USING (season_id IS NOT NULL);