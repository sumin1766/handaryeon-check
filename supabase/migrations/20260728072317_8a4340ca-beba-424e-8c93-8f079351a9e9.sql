CREATE TABLE public.segue_merge_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL,
  person_id uuid NOT NULL,
  from_church_id uuid NOT NULL,
  to_church_id uuid NOT NULL,
  moved_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.segue_merge_log TO anon, authenticated;
GRANT ALL ON public.segue_merge_log TO service_role;
ALTER TABLE public.segue_merge_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "segue_merge_log_select" ON public.segue_merge_log FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "segue_merge_log_insert" ON public.segue_merge_log FOR INSERT TO anon, authenticated WITH CHECK (season_id IS NOT NULL AND person_id IS NOT NULL AND from_church_id IS NOT NULL AND to_church_id IS NOT NULL);
CREATE POLICY "segue_merge_log_delete" ON public.segue_merge_log FOR DELETE TO anon, authenticated USING (season_id IS NOT NULL);
CREATE INDEX segue_merge_log_season_moved_idx ON public.segue_merge_log (season_id, moved_at DESC);
CREATE INDEX segue_merge_log_person_idx ON public.segue_merge_log (person_id);