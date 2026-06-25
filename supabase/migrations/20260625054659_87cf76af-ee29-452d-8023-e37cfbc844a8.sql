CREATE TABLE IF NOT EXISTS public.auth_config (
  id integer PRIMARY KEY DEFAULT 1,
  admin_password text NOT NULL,
  user_password text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_config_singleton CHECK (id = 1)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.auth_config TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auth_config TO authenticated;
GRANT ALL ON public.auth_config TO service_role;

ALTER TABLE public.auth_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_config anon select" ON public.auth_config FOR SELECT TO anon USING (true);
CREATE POLICY "auth_config anon insert" ON public.auth_config FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "auth_config anon update" ON public.auth_config FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_config auth select" ON public.auth_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_config auth insert" ON public.auth_config FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_config auth update" ON public.auth_config FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.auth_config (id, admin_password, user_password)
VALUES (1, '031213', '세계로한다련')
ON CONFLICT (id) DO NOTHING;