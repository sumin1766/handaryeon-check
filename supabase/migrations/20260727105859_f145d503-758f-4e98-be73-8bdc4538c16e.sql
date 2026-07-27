ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS nav_menu_order text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS nav_menu_hidden text[] NOT NULL DEFAULT ARRAY[]::text[];