ALTER TABLE public.pre_registration_members
  DROP CONSTRAINT IF EXISTS pre_registration_members_category_check,
  DROP CONSTRAINT IF EXISTS pre_registration_members_phone_required_check;

ALTER TABLE public.pre_registration_members
  ADD CONSTRAINT pre_registration_members_category_check
  CHECK (category = ANY (ARRAY[
    'male_student','male_adult','female_student','female_adult',
    'male_infant','male_elementary','female_infant','female_elementary',
    'male_child','female_child'
  ]::text[]));

ALTER TABLE public.pre_registration_members
  ADD CONSTRAINT pre_registration_members_phone_required_check
  CHECK (
    category = ANY (ARRAY['male_infant','female_infant','male_child','female_child']::text[])
    OR (phone IS NOT NULL AND btrim(phone) <> '')
  );