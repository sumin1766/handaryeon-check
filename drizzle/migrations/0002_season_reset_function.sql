CREATE OR REPLACE FUNCTION public.reset_season_items(p_season uuid, p_items text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_all boolean := 'all' = ANY(p_items);
BEGIN
  IF p_season IS NULL OR NOT EXISTS (SELECT 1 FROM seasons WHERE id = p_season) THEN
    RAISE EXCEPTION 'season not found';
  END IF;

  IF v_all THEN
    DELETE FROM pre_registrations WHERE season_id = p_season;
    DELETE FROM churches WHERE season_id = p_season;
    DELETE FROM bath_coupons WHERE season_id = p_season;
    DELETE FROM duplicate_dismissals WHERE season_id = p_season;
    DELETE FROM segue_merge_log WHERE season_id = p_season;
  END IF;
  IF v_all OR 'lodgings' = ANY(p_items) THEN
    DELETE FROM lodgings WHERE season_id = p_season;
    UPDATE app_settings SET lodging_manual_order = DEFAULT WHERE season_id = p_season;
  END IF;
  IF v_all OR 'places' = ANY(p_items) THEN
    DELETE FROM places WHERE season_id = p_season;
  END IF;
  IF NOT v_all AND 'bath_coupons' = ANY(p_items) THEN
    DELETE FROM bath_coupons WHERE season_id = p_season;
  END IF;
  IF v_all OR 'bath_price' = ANY(p_items) THEN
    UPDATE app_settings SET bath_unit_price = DEFAULT WHERE season_id = p_season;
  END IF;
  IF v_all OR 'fee' = ANY(p_items) THEN
    UPDATE app_settings SET pre_reg_fee = DEFAULT, segue_member_fee = DEFAULT,
      category_fees = DEFAULT, segue_fee_enabled = DEFAULT WHERE season_id = p_season;
  END IF;
  IF v_all OR 'nav_menu' = ANY(p_items) THEN
    UPDATE app_settings SET nav_menu_order = DEFAULT, nav_menu_hidden = DEFAULT WHERE season_id = p_season;
  END IF;
  IF v_all OR 'dashboard_order' = ANY(p_items) THEN
    UPDATE app_settings SET dashboard_section_order = DEFAULT WHERE season_id = p_season;
  END IF;
  IF v_all OR 'apply_form' = ANY(p_items) THEN
    UPDATE app_settings SET apply_form_notices = DEFAULT, apply_blocked = DEFAULT,
      apply_block_message = NULL WHERE season_id = p_season;
  END IF;
  IF v_all OR 'settings_card_order' = ANY(p_items) THEN
    UPDATE app_settings SET settings_card_order = DEFAULT WHERE season_id = p_season;
  END IF;
  IF v_all THEN
    UPDATE app_settings SET ocr_enabled = DEFAULT WHERE season_id = p_season;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.reset_season_items(uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_season_items(uuid, text[]) TO service_role;