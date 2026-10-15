ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS apply_blocked boolean NOT NULL DEFAULT false;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS apply_block_message text;