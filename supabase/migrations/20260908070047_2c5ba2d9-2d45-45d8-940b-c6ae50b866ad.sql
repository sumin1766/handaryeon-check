-- 1) Season-scoped fee settings on existing app_settings (additive columns only)
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS pre_reg_fee integer NOT NULL DEFAULT 20000,
  ADD COLUMN IF NOT EXISTS segue_member_fee integer NOT NULL DEFAULT 10000;

-- 2) Random access token generator
CREATE OR REPLACE FUNCTION public.gen_pre_reg_token()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public, extensions
AS $$
  SELECT replace(replace(replace(encode(extensions.gen_random_bytes(18), 'base64'), '+', 'A'), '/', 'B'), '=', '');
$$;

-- 3) pre_registrations
CREATE TABLE public.pre_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  church_name text NOT NULL CHECK (btrim(church_name) <> ''),
  manager_name text NOT NULL CHECK (btrim(manager_name) <> ''),
  manager_phone text NOT NULL CHECK (btrim(manager_phone) <> ''),
  access_token text NOT NULL UNIQUE DEFAULT public.gen_pre_reg_token(),
  expected_fee integer NOT NULL DEFAULT 0 CHECK (expected_fee >= 0),
  head_count integer NOT NULL DEFAULT 0 CHECK (head_count >= 0),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','applied')),
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pre_registrations TO authenticated;
GRANT ALL ON public.pre_registrations TO service_role;
ALTER TABLE public.pre_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pre_registrations admin all" ON public.pre_registrations
  FOR ALL TO authenticated USING (true) WITH CHECK (season_id IS NOT NULL);

CREATE INDEX pre_registrations_season_idx ON public.pre_registrations(season_id);

-- 4) pre_registration_members
CREATE TABLE public.pre_registration_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pre_registration_id uuid NOT NULL REFERENCES public.pre_registrations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (btrim(name) <> ''),
  phone text NOT NULL CHECK (btrim(phone) <> ''),
  lodging_type text NOT NULL DEFAULT 'none' CHECK (lodging_type IN ('church','external','none')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pre_registration_members TO authenticated;
GRANT ALL ON public.pre_registration_members TO service_role;
ALTER TABLE public.pre_registration_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pre_registration_members admin all" ON public.pre_registration_members
  FOR ALL TO authenticated USING (true) WITH CHECK (pre_registration_id IS NOT NULL);

CREATE INDEX pre_registration_members_parent_idx ON public.pre_registration_members(pre_registration_id);

-- 5) pre_registration_changes
CREATE TABLE public.pre_registration_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pre_registration_id uuid NOT NULL REFERENCES public.pre_registrations(id) ON DELETE CASCADE,
  change_type text NOT NULL CHECK (change_type IN ('increase','decrease','edit')),
  before_count integer NOT NULL DEFAULT 0,
  after_count integer NOT NULL DEFAULT 0,
  fee_delta integer NOT NULL DEFAULT 0,
  resolved boolean NOT NULL DEFAULT false,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pre_registration_changes TO authenticated;
GRANT ALL ON public.pre_registration_changes TO service_role;
ALTER TABLE public.pre_registration_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pre_registration_changes admin all" ON public.pre_registration_changes
  FOR ALL TO authenticated USING (true) WITH CHECK (pre_registration_id IS NOT NULL);

CREATE INDEX pre_registration_changes_parent_idx ON public.pre_registration_changes(pre_registration_id);

-- 6) updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER update_pre_registrations_updated_at
BEFORE UPDATE ON public.pre_registrations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();