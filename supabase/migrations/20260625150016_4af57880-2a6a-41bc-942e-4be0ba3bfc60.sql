
-- Add staff password and 3-role verification
ALTER TABLE public.auth_config ADD COLUMN IF NOT EXISTS staff_password_hash text;

-- Seed staff password = 007123 if not set
UPDATE public.auth_config
   SET staff_password_hash = extensions.crypt('007123', extensions.gen_salt('bf')),
       user_password_hash  = extensions.crypt('007124', extensions.gen_salt('bf')),
       updated_at = now()
 WHERE id = 1;

CREATE OR REPLACE FUNCTION public.verify_password(p text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE rec record;
BEGIN
  IF p IS NULL OR length(btrim(p)) = 0 THEN RETURN NULL; END IF;
  SELECT admin_password_hash, staff_password_hash, user_password_hash
    INTO rec FROM public.auth_config WHERE id = 1;
  IF rec IS NULL THEN RETURN NULL; END IF;
  IF rec.admin_password_hash = extensions.crypt(btrim(p), rec.admin_password_hash) THEN RETURN 'admin'; END IF;
  IF rec.staff_password_hash IS NOT NULL
     AND rec.staff_password_hash = extensions.crypt(btrim(p), rec.staff_password_hash) THEN RETURN 'staff'; END IF;
  IF rec.user_password_hash  = extensions.crypt(btrim(p), rec.user_password_hash)  THEN RETURN 'user';  END IF;
  RETURN NULL;
END $function$;

DROP FUNCTION IF EXISTS public.change_passwords(text, text, text);
CREATE OR REPLACE FUNCTION public.change_passwords(
  current_admin text, new_admin text, new_staff text, new_user text
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  rec record;
  a text := btrim(coalesce(new_admin, ''));
  s text := btrim(coalesce(new_staff, ''));
  u text := btrim(coalesce(new_user, ''));
BEGIN
  IF a = '' OR s = '' OR u = '' THEN RAISE EXCEPTION '비밀번호는 비워둘 수 없습니다.'; END IF;
  IF a = s OR a = u OR s = u THEN RAISE EXCEPTION '세 비밀번호는 모두 달라야 합니다.'; END IF;
  SELECT admin_password_hash INTO rec FROM public.auth_config WHERE id = 1;
  IF rec IS NULL OR rec.admin_password_hash <> extensions.crypt(btrim(coalesce(current_admin,'')), rec.admin_password_hash) THEN
    RAISE EXCEPTION '현재 관리자 비밀번호가 올바르지 않습니다.';
  END IF;
  UPDATE public.auth_config
     SET admin_password_hash = extensions.crypt(a, extensions.gen_salt('bf')),
         staff_password_hash = extensions.crypt(s, extensions.gen_salt('bf')),
         user_password_hash  = extensions.crypt(u, extensions.gen_salt('bf')),
         updated_at = now()
   WHERE id = 1;
END $function$;
