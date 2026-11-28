CREATE TABLE public.season_guides (
  season_id uuid PRIMARY KEY REFERENCES public.seasons(id),
  body text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.season_guides TO service_role;
REVOKE ALL ON public.season_guides FROM anon, authenticated;
ALTER TABLE public.season_guides ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.season_guides IS 'Server-only active-season public guide; no direct client policies.';