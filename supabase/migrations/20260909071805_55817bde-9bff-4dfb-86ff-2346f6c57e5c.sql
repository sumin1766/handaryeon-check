-- 남은 authenticated 권한/정책도 회수한다.
-- 이 앱은 Supabase 로그인 계정을 쓰지 않고 서버 함수(service_role)만 데이터에 접근한다.
DO $$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'people','churches','church_payments','bath_coupons','seasons','app_settings',
    'lodgings','places','receipt_layout','segue_merge_log','duplicate_dismissals',
    'pre_registrations','pre_registration_members','pre_registration_changes'
  ] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    FOR p IN
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.verify_password(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.change_passwords(text, text, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.ocr_status() FROM authenticated;
REVOKE ALL ON FUNCTION public.ocr_config_update(text, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.ocr_backup_key_update(text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.gen_pre_reg_token() FROM authenticated;