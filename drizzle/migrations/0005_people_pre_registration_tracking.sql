ALTER TABLE public.people ADD COLUMN IF NOT EXISTS pre_registration_id uuid REFERENCES public.pre_registrations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS people_pre_registration_id_idx ON public.people(pre_registration_id);
UPDATE public.people p SET pre_registration_id = m.pre_registration_id
  FROM public.pre_registration_members m
  WHERE m.person_id = p.id AND p.pre_registration_id IS NULL;
ALTER TABLE public.pre_registration_changes ADD COLUMN IF NOT EXISTS actor text;
ALTER TABLE public.pre_registration_changes ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN public.people.pre_registration_id IS 'Source pre-registration this attendee came from (null = manual/onsite).';
COMMENT ON COLUMN public.pre_registration_changes.actor IS 'admin | staff | user | null(unknown)';