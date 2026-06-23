CREATE TABLE public.receipt_layout (
  id INTEGER PRIMARY KEY DEFAULT 1,
  layout JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT receipt_layout_singleton CHECK (id = 1)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipt_layout TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.receipt_layout TO anon;
GRANT ALL ON public.receipt_layout TO service_role;
ALTER TABLE public.receipt_layout ENABLE ROW LEVEL SECURITY;
CREATE POLICY "receipt_layout_select" ON public.receipt_layout FOR SELECT USING (true);
CREATE POLICY "receipt_layout_insert" ON public.receipt_layout FOR INSERT WITH CHECK (id = 1);
CREATE POLICY "receipt_layout_update" ON public.receipt_layout FOR UPDATE USING (id = 1) WITH CHECK (id = 1);
INSERT INTO public.receipt_layout (id, layout) VALUES (1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING;
ALTER PUBLICATION supabase_realtime ADD TABLE public.receipt_layout;