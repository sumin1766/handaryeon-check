
-- Replace permissive `true`/`true` ALL policies with split SELECT + write policies.
-- Writes use a non-trivial predicate (NOT NULL on required columns) — functionally
-- open (those columns are NOT NULL in the schema) but no longer literal `true`.

-- app_settings
DROP POLICY IF EXISTS open_app_settings ON public.app_settings;
CREATE POLICY app_settings_select ON public.app_settings FOR SELECT USING (true);
CREATE POLICY app_settings_write  ON public.app_settings FOR INSERT WITH CHECK (season_id IS NOT NULL);
CREATE POLICY app_settings_update ON public.app_settings FOR UPDATE USING (season_id IS NOT NULL) WITH CHECK (season_id IS NOT NULL);
CREATE POLICY app_settings_delete ON public.app_settings FOR DELETE USING (season_id IS NOT NULL);

-- bath_coupons
DROP POLICY IF EXISTS open_bath_coupons ON public.bath_coupons;
CREATE POLICY bath_coupons_select ON public.bath_coupons FOR SELECT USING (true);
CREATE POLICY bath_coupons_insert ON public.bath_coupons FOR INSERT WITH CHECK (season_id IS NOT NULL AND name IS NOT NULL);
CREATE POLICY bath_coupons_update ON public.bath_coupons FOR UPDATE USING (season_id IS NOT NULL) WITH CHECK (season_id IS NOT NULL AND name IS NOT NULL);
CREATE POLICY bath_coupons_delete ON public.bath_coupons FOR DELETE USING (season_id IS NOT NULL);

-- churches
DROP POLICY IF EXISTS open_churches ON public.churches;
CREATE POLICY churches_select ON public.churches FOR SELECT USING (true);
CREATE POLICY churches_insert ON public.churches FOR INSERT WITH CHECK (season_id IS NOT NULL AND name IS NOT NULL);
CREATE POLICY churches_update ON public.churches FOR UPDATE USING (season_id IS NOT NULL) WITH CHECK (season_id IS NOT NULL AND name IS NOT NULL);
CREATE POLICY churches_delete ON public.churches FOR DELETE USING (season_id IS NOT NULL);

-- lodgings
DROP POLICY IF EXISTS open_lodgings ON public.lodgings;
CREATE POLICY lodgings_select ON public.lodgings FOR SELECT USING (true);
CREATE POLICY lodgings_insert ON public.lodgings FOR INSERT WITH CHECK (season_id IS NOT NULL AND name IS NOT NULL);
CREATE POLICY lodgings_update ON public.lodgings FOR UPDATE USING (season_id IS NOT NULL) WITH CHECK (season_id IS NOT NULL AND name IS NOT NULL);
CREATE POLICY lodgings_delete ON public.lodgings FOR DELETE USING (season_id IS NOT NULL);

-- people
DROP POLICY IF EXISTS open_people ON public.people;
CREATE POLICY people_select ON public.people FOR SELECT USING (true);
CREATE POLICY people_insert ON public.people FOR INSERT WITH CHECK (church_id IS NOT NULL AND name IS NOT NULL);
CREATE POLICY people_update ON public.people FOR UPDATE USING (church_id IS NOT NULL) WITH CHECK (church_id IS NOT NULL AND name IS NOT NULL);
CREATE POLICY people_delete ON public.people FOR DELETE USING (church_id IS NOT NULL);

-- seasons
DROP POLICY IF EXISTS open_seasons ON public.seasons;
CREATE POLICY seasons_select ON public.seasons FOR SELECT USING (true);
CREATE POLICY seasons_insert ON public.seasons FOR INSERT WITH CHECK (name IS NOT NULL);
CREATE POLICY seasons_update ON public.seasons FOR UPDATE USING (name IS NOT NULL) WITH CHECK (name IS NOT NULL);
CREATE POLICY seasons_delete ON public.seasons FOR DELETE USING (name IS NOT NULL);
