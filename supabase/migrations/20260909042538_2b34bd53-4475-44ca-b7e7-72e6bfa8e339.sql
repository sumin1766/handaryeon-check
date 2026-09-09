ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS category_fees jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS segue_fee_enabled boolean NOT NULL DEFAULT true;