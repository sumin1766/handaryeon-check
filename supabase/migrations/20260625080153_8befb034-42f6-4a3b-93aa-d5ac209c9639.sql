
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) auth_config: hash + lockdown
ALTER TABLE public.auth_config
  ADD COLUMN admin_password_hash text,
  ADD COLUMN user_password_hash  text;

UPDATE public.auth_config
   SET admin_password_hash = crypt(admin_password, gen_salt('bf')),
       user_password_hash  = crypt(user_password,  gen_salt('bf'))
 WHERE id = 1;

ALTER TABLE public.auth_config DROP COLUMN admin_password;
ALTER TABLE public.auth_config DROP COLUMN user_password;

INSERT INTO public.auth_config (id, admin_password_hash, user_password_hash, updated_at)
VALUES (1, crypt('031213', gen_salt('bf')), crypt('세계로한다련', gen_salt('bf')), now())
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.auth_config
  ALTER COLUMN admin_password_hash SET NOT NULL,
  ALTER COLUMN user_password_hash  SET NOT NULL;

DROP POLICY IF EXISTS "auth_config anon insert" ON public.auth_config;
DROP POLICY IF EXISTS "auth_config anon select" ON public.auth_config;
DROP POLICY IF EXISTS "auth_config anon update" ON public.auth_config;
DROP POLICY IF EXISTS "auth_config auth insert" ON public.auth_config;
DROP POLICY IF EXISTS "auth_config auth select" ON public.auth_config;
DROP POLICY IF EXISTS "auth_config auth update" ON public.auth_config;
REVOKE ALL ON public.auth_config FROM anon, authenticated;
GRANT  ALL ON public.auth_config TO service_role;
ALTER TABLE public.auth_config ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.verify_password(p text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE rec record;
BEGIN
  IF p IS NULL OR length(btrim(p)) = 0 THEN RETURN NULL; END IF;
  SELECT admin_password_hash, user_password_hash INTO rec FROM public.auth_config WHERE id = 1;
  IF rec IS NULL THEN RETURN NULL; END IF;
  IF rec.admin_password_hash = crypt(btrim(p), rec.admin_password_hash) THEN RETURN 'admin'; END IF;
  IF rec.user_password_hash  = crypt(btrim(p), rec.user_password_hash)  THEN RETURN 'user';  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.change_passwords(current_admin text, new_admin text, new_user text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec record;
  a text := btrim(coalesce(new_admin, ''));
  u text := btrim(coalesce(new_user, ''));
BEGIN
  IF a = '' OR u = '' THEN RAISE EXCEPTION '비밀번호는 비워둘 수 없습니다.'; END IF;
  IF a = u THEN RAISE EXCEPTION '관리자와 일반 사용자 비밀번호가 같을 수 없습니다.'; END IF;
  SELECT admin_password_hash INTO rec FROM public.auth_config WHERE id = 1;
  IF rec IS NULL OR rec.admin_password_hash <> crypt(btrim(coalesce(current_admin,'')), rec.admin_password_hash) THEN
    RAISE EXCEPTION '현재 관리자 비밀번호가 올바르지 않습니다.';
  END IF;
  UPDATE public.auth_config
     SET admin_password_hash = crypt(a, gen_salt('bf')),
         user_password_hash  = crypt(u, gen_salt('bf')),
         updated_at = now()
   WHERE id = 1;
END $$;

REVOKE ALL ON FUNCTION public.verify_password(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.change_passwords(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_password(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_passwords(text, text, text) TO authenticated;

-- 2) Drop all "Allow all" permissive policies
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['app_settings','bath_coupons','churches','lodgings','people','receipt_layout','seasons'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Allow all delete on ' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Allow all insert on ' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Allow all select on ' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Allow all update on ' || t, t);
  END LOOP;
END$$;

-- 3) churches & people → authenticated only
REVOKE ALL ON public.churches FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.churches TO authenticated;
CREATE POLICY "churches auth select" ON public.churches FOR SELECT TO authenticated USING (true);
CREATE POLICY "churches auth insert" ON public.churches FOR INSERT TO authenticated
  WITH CHECK (name IS NOT NULL AND btrim(name) <> '');
CREATE POLICY "churches auth update" ON public.churches FOR UPDATE TO authenticated
  USING (true) WITH CHECK (name IS NOT NULL AND btrim(name) <> '');
CREATE POLICY "churches auth delete" ON public.churches FOR DELETE TO authenticated USING (true);

REVOKE ALL ON public.people FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people TO authenticated;
CREATE POLICY "people auth select" ON public.people FOR SELECT TO authenticated USING (true);
CREATE POLICY "people auth insert" ON public.people FOR INSERT TO authenticated
  WITH CHECK (name IS NOT NULL AND btrim(name) <> '');
CREATE POLICY "people auth update" ON public.people FOR UPDATE TO authenticated
  USING (true) WITH CHECK (name IS NOT NULL AND btrim(name) <> '');
CREATE POLICY "people auth delete" ON public.people FOR DELETE TO authenticated USING (true);

-- 4) Operational tables: anon+authenticated, non-trivial predicates
CREATE POLICY "app_settings select" ON public.app_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "app_settings insert" ON public.app_settings FOR INSERT TO anon, authenticated
  WITH CHECK (season_id IS NOT NULL AND bath_unit_price >= 0);
CREATE POLICY "app_settings update" ON public.app_settings FOR UPDATE TO anon, authenticated
  USING (season_id IS NOT NULL) WITH CHECK (season_id IS NOT NULL AND bath_unit_price >= 0);
CREATE POLICY "app_settings delete" ON public.app_settings FOR DELETE TO anon, authenticated
  USING (season_id IS NOT NULL);

CREATE POLICY "bath_coupons select" ON public.bath_coupons FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "bath_coupons insert" ON public.bath_coupons FOR INSERT TO anon, authenticated
  WITH CHECK (season_id IS NOT NULL AND name IS NOT NULL AND btrim(name) <> '');
CREATE POLICY "bath_coupons update" ON public.bath_coupons FOR UPDATE TO anon, authenticated
  USING (season_id IS NOT NULL) WITH CHECK (season_id IS NOT NULL AND name IS NOT NULL AND btrim(name) <> '');
CREATE POLICY "bath_coupons delete" ON public.bath_coupons FOR DELETE TO anon, authenticated
  USING (season_id IS NOT NULL);

CREATE POLICY "lodgings select" ON public.lodgings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "lodgings insert" ON public.lodgings FOR INSERT TO anon, authenticated
  WITH CHECK (season_id IS NOT NULL AND name IS NOT NULL AND btrim(name) <> '');
CREATE POLICY "lodgings update" ON public.lodgings FOR UPDATE TO anon, authenticated
  USING (season_id IS NOT NULL) WITH CHECK (season_id IS NOT NULL AND name IS NOT NULL AND btrim(name) <> '');
CREATE POLICY "lodgings delete" ON public.lodgings FOR DELETE TO anon, authenticated
  USING (season_id IS NOT NULL);

CREATE POLICY "receipt_layout select" ON public.receipt_layout FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "receipt_layout insert" ON public.receipt_layout FOR INSERT TO anon, authenticated
  WITH CHECK (id = 1 AND layout IS NOT NULL);
CREATE POLICY "receipt_layout update" ON public.receipt_layout FOR UPDATE TO anon, authenticated
  USING (id = 1) WITH CHECK (id = 1 AND layout IS NOT NULL);
CREATE POLICY "receipt_layout delete" ON public.receipt_layout FOR DELETE TO anon, authenticated
  USING (id = 1);

CREATE POLICY "seasons select" ON public.seasons FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "seasons insert" ON public.seasons FOR INSERT TO anon, authenticated
  WITH CHECK (name IS NOT NULL AND btrim(name) <> '');
CREATE POLICY "seasons update" ON public.seasons FOR UPDATE TO anon, authenticated
  USING (name IS NOT NULL) WITH CHECK (name IS NOT NULL AND btrim(name) <> '');
CREATE POLICY "seasons delete" ON public.seasons FOR DELETE TO anon, authenticated
  USING (name IS NOT NULL);
