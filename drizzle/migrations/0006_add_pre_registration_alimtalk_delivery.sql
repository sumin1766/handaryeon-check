CREATE TABLE public.pre_registration_notifications (
  pre_registration_id uuid PRIMARY KEY,
  automatic_attempted boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'unsent' CHECK (status IN ('unsent','sending','sent','failed')),
  attempted_at timestamptz,
  sent_at timestamptz,
  success_at timestamptz,
  message_id text,
  failure_reason text,
  lock_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.pre_registration_notifications TO service_role;
ALTER TABLE public.pre_registration_notifications ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.pre_registration_notification_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pre_registration_id uuid NOT NULL,
  automatic boolean NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (status IN ('unsent','sent','failed')),
  message_id text,
  failure_reason text,
  fallback_enabled boolean NOT NULL DEFAULT false
);
GRANT ALL ON public.pre_registration_notification_attempts TO service_role;
ALTER TABLE public.pre_registration_notification_attempts ENABLE ROW LEVEL SECURITY;
CREATE INDEX pre_registration_notification_attempts_registration_idx ON public.pre_registration_notification_attempts(pre_registration_id, attempted_at DESC);
CREATE UNIQUE INDEX pre_registration_notification_one_automatic_idx ON public.pre_registration_notification_attempts(pre_registration_id) WHERE automatic;
CREATE FUNCTION public.claim_pre_registration_notification(p_id uuid, p_automatic boolean, p_lock uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.pre_registration_notifications%ROWTYPE;
BEGIN
  INSERT INTO public.pre_registration_notifications(pre_registration_id) VALUES(p_id) ON CONFLICT DO NOTHING;
  SELECT * INTO r FROM public.pre_registration_notifications WHERE pre_registration_id=p_id FOR UPDATE;
  IF r.lock_id IS NOT NULL OR (p_automatic AND (r.automatic_attempted OR r.success_at IS NOT NULL)) THEN RETURN false; END IF;
  UPDATE public.pre_registration_notifications SET lock_id=p_lock, status='sending', failure_reason=NULL, attempted_at=now(), updated_at=now(), automatic_attempted=(automatic_attempted OR p_automatic) WHERE pre_registration_id=p_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_pre_registration_notification(uuid,boolean,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pre_registration_notification(uuid,boolean,uuid) TO service_role;
CREATE FUNCTION public.finish_pre_registration_notification(p_id uuid,p_lock uuid,p_automatic boolean,p_status text,p_message_id text,p_reason text,p_fallback boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_status NOT IN ('unsent','sent','failed') THEN RAISE EXCEPTION 'Invalid delivery status'; END IF;
  UPDATE public.pre_registration_notifications SET status=p_status, message_id=p_message_id, failure_reason=p_reason, sent_at=CASE WHEN p_status='sent' THEN now() ELSE NULL END, success_at=CASE WHEN p_status='sent' THEN now() ELSE success_at END, lock_id=NULL, updated_at=now() WHERE pre_registration_id=p_id AND lock_id=p_lock;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.pre_registration_notification_attempts(pre_registration_id,automatic,status,message_id,failure_reason,fallback_enabled) VALUES(p_id,p_automatic,p_status,p_message_id,p_reason,p_fallback);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_pre_registration_notification(uuid,uuid,boolean,text,text,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_pre_registration_notification(uuid,uuid,boolean,text,text,text,boolean) TO service_role;