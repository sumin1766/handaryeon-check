
ALTER TABLE public.ocr_config ADD COLUMN IF NOT EXISTS backup_api_key TEXT;

-- Extend ocr_status to also expose backup key masking info
CREATE OR REPLACE FUNCTION public.ocr_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; k text; b text;
BEGIN
  SELECT api_key, base_url, backup_api_key INTO r FROM public.ocr_config WHERE id = 1;
  k := btrim(coalesce(r.api_key, ''));
  b := btrim(coalesce(r.backup_api_key, ''));
  RETURN jsonb_build_object(
    'has_key', length(k) > 0,
    'key_last4', CASE WHEN length(k) >= 4 THEN right(k, 4) WHEN length(k) > 0 THEN k ELSE NULL END,
    'base_url', coalesce(r.base_url, ''),
    'has_backup_key', length(b) > 0,
    'backup_key_last4', CASE WHEN length(b) >= 4 THEN right(b, 4) WHEN length(b) > 0 THEN b ELSE NULL END
  );
END $function$;

-- RPC to update the backup key (admin-password gated)
CREATE OR REPLACE FUNCTION public.ocr_backup_key_update(current_admin text, new_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE rec record;
BEGIN
  SELECT admin_password_hash INTO rec FROM public.auth_config WHERE id = 1;
  IF rec IS NULL OR rec.admin_password_hash <> extensions.crypt(btrim(coalesce(current_admin,'')), rec.admin_password_hash) THEN
    RAISE EXCEPTION '관리자 비밀번호가 올바르지 않습니다.';
  END IF;
  IF new_key IS NULL THEN
    RAISE EXCEPTION '키 값을 입력해주세요.';
  END IF;
  -- Empty string clears the key; non-empty sets it.
  UPDATE public.ocr_config
    SET backup_api_key = CASE WHEN length(btrim(new_key)) > 0 THEN btrim(new_key) ELSE NULL END,
        updated_at = now()
    WHERE id = 1;
  RETURN public.ocr_status();
END $function$;
