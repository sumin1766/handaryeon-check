REVOKE ALL ON TABLE public.pre_registration_notifications FROM anon, authenticated;
REVOKE ALL ON TABLE public.pre_registration_notification_attempts FROM anon, authenticated;
GRANT ALL ON TABLE public.pre_registration_notifications TO service_role;
GRANT ALL ON TABLE public.pre_registration_notification_attempts TO service_role;