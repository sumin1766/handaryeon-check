CREATE TABLE public.places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL,
  name text NOT NULL,
  purpose text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.places TO anon, authenticated;
GRANT ALL ON public.places TO service_role;

ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;

CREATE POLICY "places select" ON public.places FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "places insert" ON public.places FOR INSERT
  TO anon, authenticated WITH CHECK (season_id IS NOT NULL AND btrim(name) <> '');
CREATE POLICY "places update" ON public.places FOR UPDATE
  TO anon, authenticated USING (season_id IS NOT NULL)
  WITH CHECK (season_id IS NOT NULL AND btrim(name) <> '');
CREATE POLICY "places delete" ON public.places FOR DELETE
  TO anon, authenticated USING (season_id IS NOT NULL);