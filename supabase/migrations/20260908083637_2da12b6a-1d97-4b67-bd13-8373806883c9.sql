ALTER TABLE public.pre_registration_members
  ADD COLUMN category text NOT NULL DEFAULT 'male_student';

ALTER TABLE public.pre_registration_members
  ADD CONSTRAINT pre_registration_members_category_check
  CHECK (category IN ('male_student','male_adult','female_student','female_adult','male_child','female_child'));

ALTER TABLE public.pre_registration_members
  ALTER COLUMN phone DROP NOT NULL;

ALTER TABLE public.pre_registration_members
  ADD CONSTRAINT pre_registration_members_phone_required_check
  CHECK (
    category IN ('male_child','female_child')
    OR (phone IS NOT NULL AND btrim(phone) <> '')
  );