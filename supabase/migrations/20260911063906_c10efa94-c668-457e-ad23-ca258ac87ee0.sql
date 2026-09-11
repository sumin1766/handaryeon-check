ALTER TABLE public.churches
  ADD COLUMN IF NOT EXISTS primary_pre_registration_id uuid
  REFERENCES public.pre_registrations(id) ON DELETE SET NULL;