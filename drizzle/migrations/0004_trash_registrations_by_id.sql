CREATE OR REPLACE FUNCTION public.trash_season_registrations(p_season uuid, p_kind text, p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  r record;
  c record;
BEGIN
  IF p_season IS NULL OR NOT EXISTS (SELECT 1 FROM seasons WHERE id = p_season) THEN
    RAISE EXCEPTION 'season not found';
  END IF;
  IF p_kind = 'pending' THEN
    FOR r IN SELECT * FROM pre_registrations WHERE season_id = p_season AND church_id IS NULL
             AND (p_ids IS NULL OR id = ANY(p_ids)) LOOP
      INSERT INTO registration_trash(season_id, original_status, church_name, manager_name, head_count, snapshot)
      VALUES (p_season, 'pending', r.church_name, r.manager_name, r.head_count,
        jsonb_build_object('kind','pending','registrations', jsonb_build_array(jsonb_build_object(
          'registration', to_jsonb(r) - 'access_token' - 'id' - 'church_id',
          'members', COALESCE((SELECT jsonb_agg(to_jsonb(m) - 'id' - 'pre_registration_id' - 'person_id' ORDER BY m.created_at)
                               FROM pre_registration_members m WHERE m.pre_registration_id = r.id), '[]'::jsonb)))));
      DELETE FROM pre_registrations WHERE id = r.id AND season_id = p_season;
      v_count := v_count + 1;
    END LOOP;
  ELSIF p_kind = 'confirmed' THEN
    FOR c IN SELECT * FROM churches WHERE season_id = p_season
             AND (p_ids IS NULL OR id = ANY(p_ids)) LOOP
      INSERT INTO registration_trash(season_id, original_status, church_name, manager_name, head_count, snapshot)
      VALUES (p_season, 'confirmed', c.name, c.contact_name,
        (SELECT count(*) FROM people p WHERE p.church_id = c.id),
        jsonb_build_object('kind','confirmed',
          'church', to_jsonb(c) - 'id' - 'primary_pre_registration_id',
          'people', COALESCE((SELECT jsonb_agg(to_jsonb(p) - 'id' - 'church_id' - 'lodging_id' ORDER BY p.created_at)
                              FROM people p WHERE p.church_id = c.id), '[]'::jsonb),
          'payments', COALESCE((SELECT jsonb_agg(to_jsonb(cp) - 'id' - 'church_id') FROM church_payments cp WHERE cp.church_id = c.id), '[]'::jsonb),
          'registrations', COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'registration', to_jsonb(pr) - 'access_token' - 'id' - 'church_id',
              'members', COALESCE((SELECT jsonb_agg(to_jsonb(m) - 'id' - 'pre_registration_id' - 'person_id' ORDER BY m.created_at)
                                   FROM pre_registration_members m WHERE m.pre_registration_id = pr.id), '[]'::jsonb))
              ORDER BY pr.created_at)
            FROM pre_registrations pr WHERE pr.church_id = c.id AND pr.season_id = p_season), '[]'::jsonb)));
      DELETE FROM pre_registrations WHERE church_id = c.id AND season_id = p_season;
      DELETE FROM churches WHERE id = c.id AND season_id = p_season;
      v_count := v_count + 1;
    END LOOP;
  ELSE
    RAISE EXCEPTION 'unknown kind';
  END IF;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.trash_season_registrations(uuid, text, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trash_season_registrations(uuid, text, uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.trash_season_registrations(p_season uuid, p_kind text)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.trash_season_registrations(p_season, p_kind, NULL::uuid[]) $$;
REVOKE ALL ON FUNCTION public.trash_season_registrations(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trash_season_registrations(uuid, text) TO service_role;