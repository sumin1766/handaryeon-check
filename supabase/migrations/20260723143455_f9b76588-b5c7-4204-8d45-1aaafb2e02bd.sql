ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS dashboard_section_order text[]
  NOT NULL DEFAULT ARRAY['pre','segue','actual']::text[];