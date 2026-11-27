CREATE TABLE public.registration_operation_locks (
  resource_key text PRIMARY KEY,
  owner uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX registration_operation_locks_owner_idx ON public.registration_operation_locks(owner);
GRANT ALL ON public.registration_operation_locks TO service_role;
REVOKE ALL ON public.registration_operation_locks FROM PUBLIC, anon, authenticated;
ALTER TABLE public.registration_operation_locks ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.claim_registration_operation(
  p_registration uuid, p_owner uuid, p_target_church uuid DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.pre_registrations; keys text[]; k text; old_church uuid;
BEGIN
  IF p_owner IS NULL THEN RAISE EXCEPTION 'OWNER_REQUIRED'; END IF;
  SELECT * INTO r FROM public.pre_registrations WHERE id=p_registration;
  IF NOT FOUND THEN RAISE EXCEPTION 'REGISTRATION_NOT_FOUND'; END IF;
  PERFORM 1 FROM public.seasons WHERE id=r.season_id AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACTIVE_SEASON_REQUIRED'; END IF;
  old_church := r.church_id;
  IF p_target_church IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.churches WHERE id=p_target_church AND season_id=r.season_id
  ) THEN RAISE EXCEPTION 'TARGET_CHURCH_INVALID'; END IF;
  keys := ARRAY['registration:' || p_registration::text];
  IF old_church IS NOT NULL THEN keys := array_append(keys,'church:' || old_church::text); END IF;
  IF p_target_church IS NOT NULL THEN keys := array_append(keys,'church:' || p_target_church::text); END IF;
  FOR k IN SELECT DISTINCT unnest(keys) ORDER BY 1 LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(k,0));
  END LOOP;
  PERFORM 1 FROM public.churches WHERE id IN (old_church,p_target_church) ORDER BY id FOR UPDATE;
  SELECT * INTO r FROM public.pre_registrations WHERE id=p_registration FOR UPDATE;
  IF NOT FOUND OR r.church_id IS DISTINCT FROM old_church THEN
    RAISE EXCEPTION 'REGISTRATION_CHANGED_RETRY';
  END IF;
  IF EXISTS (SELECT 1 FROM public.registration_operation_locks WHERE resource_key=ANY(keys)) THEN RETURN false; END IF;
  INSERT INTO public.registration_operation_locks(resource_key,owner)
    SELECT DISTINCT unnest(keys),p_owner;
  RETURN true;
END $$;

CREATE FUNCTION public.release_registration_operation(p_owner uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_owner IS NULL THEN RAISE EXCEPTION 'OWNER_REQUIRED'; END IF;
  DELETE FROM public.registration_operation_locks WHERE owner=p_owner;
END $$;

CREATE FUNCTION public.stale_registration_operation_locks()
RETURNS TABLE(owner uuid, resource_keys text[], started_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT l.owner, array_agg(l.resource_key ORDER BY l.resource_key), min(l.started_at)
  FROM public.registration_operation_locks l
  GROUP BY l.owner
  HAVING max(l.started_at) <= now() - interval '5 minutes'
  ORDER BY 3;
$$;

CREATE FUNCTION public.force_release_registration_operation(p_owner uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE n integer;
BEGIN
  IF p_owner IS NULL THEN RAISE EXCEPTION 'OWNER_REQUIRED'; END IF;
  IF EXISTS (SELECT 1 FROM public.registration_operation_locks
             WHERE owner=p_owner AND started_at > now() - interval '5 minutes') THEN
    RAISE EXCEPTION 'LOCK_TOO_RECENT';
  END IF;
  DELETE FROM public.registration_operation_locks WHERE owner=p_owner;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.claim_registration_operation(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.release_registration_operation(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.stale_registration_operation_locks() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.force_release_registration_operation(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_registration_operation(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_registration_operation(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.stale_registration_operation_locks() TO service_role;
GRANT EXECUTE ON FUNCTION public.force_release_registration_operation(uuid) TO service_role;