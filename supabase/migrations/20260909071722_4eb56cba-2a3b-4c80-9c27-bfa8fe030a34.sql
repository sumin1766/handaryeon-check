-- 3단계: 익명(anon) 직접 접근 차단.
-- 모든 화면은 서버 함수(service_role) 경유로 전환 완료된 상태이므로
-- 익명 권한 회수는 화면 동작에 영향을 주지 않는다. 데이터는 변경하지 않는다.

DO $$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'people','churches','church_payments','bath_coupons','seasons','app_settings',
    'lodgings','places','receipt_layout','segue_merge_log','duplicate_dismissals',
    'pre_registrations','pre_registration_members','pre_registration_changes'
  ] LOOP
    -- 익명 권한 회수 (조회·변조 모두 차단)
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    -- 서버 함수용 권한은 유지
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);

    -- anon 을 포함하는 정책 삭제 (authenticated 전용 정책은 유지)
    FOR p IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND 'anon' = ANY(roles)
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- 데이터베이스 함수의 익명 실행 권한 회수 (외부 무제한 대입 차단)
REVOKE ALL ON FUNCTION public.verify_password(text) FROM anon, public;
REVOKE ALL ON FUNCTION public.change_passwords(text, text, text, text) FROM anon, public;
REVOKE ALL ON FUNCTION public.ocr_status() FROM anon, public;
REVOKE ALL ON FUNCTION public.ocr_config_update(text, text, text) FROM anon, public;
REVOKE ALL ON FUNCTION public.ocr_backup_key_update(text, text) FROM anon, public;
REVOKE ALL ON FUNCTION public.gen_pre_reg_token() FROM anon, public;

GRANT EXECUTE ON FUNCTION public.verify_password(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.change_passwords(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ocr_status() TO service_role;
GRANT EXECUTE ON FUNCTION public.ocr_config_update(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ocr_backup_key_update(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gen_pre_reg_token() TO service_role;