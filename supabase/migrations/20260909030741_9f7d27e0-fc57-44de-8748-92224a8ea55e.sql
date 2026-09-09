ALTER TABLE public.pre_registrations
  ADD COLUMN IF NOT EXISTS church_id uuid REFERENCES public.churches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

ALTER TABLE public.pre_registration_members
  ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.people(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pre_registrations_church_id ON public.pre_registrations(church_id);
CREATE INDEX IF NOT EXISTS idx_pre_registration_members_person_id ON public.pre_registration_members(person_id);