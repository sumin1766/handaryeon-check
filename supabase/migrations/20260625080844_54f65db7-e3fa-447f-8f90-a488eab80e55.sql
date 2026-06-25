create extension if not exists pgcrypto with schema extensions;

CREATE OR REPLACE FUNCTION public.verify_password(p text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE rec record;
BEGIN
  IF p IS NULL OR length(btrim(p)) = 0 THEN RETURN NULL; END IF;
  SELECT admin_password_hash, user_password_hash INTO rec FROM public.auth_config WHERE id = 1;
  IF rec IS NULL THEN RETURN NULL; END IF;
  IF rec.admin_password_hash = extensions.crypt(btrim(p), rec.admin_password_hash) THEN RETURN 'admin'; END IF;
  IF rec.user_password_hash  = extensions.crypt(btrim(p), rec.user_password_hash)  THEN RETURN 'user';  END IF;
  RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION public.change_passwords(current_admin text, new_admin text, new_user text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  rec record;
  a text := btrim(coalesce(new_admin, ''));
  u text := btrim(coalesce(new_user, ''));
BEGIN
  IF a = '' OR u = '' THEN RAISE EXCEPTION '비밀번호는 비워둘 수 없습니다.'; END IF;
  IF a = u THEN RAISE EXCEPTION '관리자와 일반 사용자 비밀번호가 같을 수 없습니다.'; END IF;
  SELECT admin_password_hash INTO rec FROM public.auth_config WHERE id = 1;
  IF rec IS NULL OR rec.admin_password_hash <> extensions.crypt(btrim(coalesce(current_admin,'')), rec.admin_password_hash) THEN
    RAISE EXCEPTION '현재 관리자 비밀번호가 올바르지 않습니다.';
  END IF;
  UPDATE public.auth_config
     SET admin_password_hash = extensions.crypt(a, extensions.gen_salt('bf')),
         user_password_hash  = extensions.crypt(u, extensions.gen_salt('bf')),
         updated_at = now()
   WHERE id = 1;
END $function$;

-- Reseed default hashes using pgcrypto so verification works
UPDATE public.auth_config
   SET admin_password_hash = extensions.crypt('031213', extensions.gen_salt('bf')),
       user_password_hash  = extensions.crypt('세계로한다련', extensions.gen_salt('bf')),
       updated_at = now()
 WHERE id = 1;