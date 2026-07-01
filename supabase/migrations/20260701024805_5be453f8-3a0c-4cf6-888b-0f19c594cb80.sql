
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS ocr_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.ocr_config (
  id smallint PRIMARY KEY,
  api_key text,
  base_url text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ocr_config_singleton CHECK (id = 1)
);
INSERT INTO public.ocr_config (id) VALUES (1) ON CONFLICT DO NOTHING;
GRANT ALL ON public.ocr_config TO service_role;
ALTER TABLE public.ocr_config ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.ocr_status()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; k text;
BEGIN
  SELECT api_key, base_url INTO r FROM public.ocr_config WHERE id = 1;
  k := btrim(coalesce(r.api_key, ''));
  RETURN jsonb_build_object(
    'has_key', length(k) > 0,
    'key_last4', CASE WHEN length(k) >= 4 THEN right(k, 4) WHEN length(k) > 0 THEN k ELSE NULL END,
    'base_url', coalesce(r.base_url, '')
  );
END $$;
GRANT EXECUTE ON FUNCTION public.ocr_status() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.ocr_config_update(current_admin text, new_api_key text, new_base_url text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE rec record;
BEGIN
  SELECT admin_password_hash INTO rec FROM public.auth_config WHERE id = 1;
  IF rec IS NULL OR rec.admin_password_hash <> extensions.crypt(btrim(coalesce(current_admin,'')), rec.admin_password_hash) THEN
    RAISE EXCEPTION '관리자 비밀번호가 올바르지 않습니다.';
  END IF;
  IF (new_api_key IS NULL OR length(btrim(new_api_key)) = 0)
     AND (new_base_url IS NULL OR length(btrim(new_base_url)) = 0) THEN
    RAISE EXCEPTION '변경할 값을 입력해주세요.';
  END IF;
  UPDATE public.ocr_config SET
    api_key  = CASE WHEN new_api_key  IS NOT NULL AND length(btrim(new_api_key))  > 0 THEN btrim(new_api_key)  ELSE api_key  END,
    base_url = CASE WHEN new_base_url IS NOT NULL AND length(btrim(new_base_url)) > 0 THEN btrim(new_base_url) ELSE base_url END,
    updated_at = now()
  WHERE id = 1;
  RETURN public.ocr_status();
END $$;
GRANT EXECUTE ON FUNCTION public.ocr_config_update(text,text,text) TO anon, authenticated;
