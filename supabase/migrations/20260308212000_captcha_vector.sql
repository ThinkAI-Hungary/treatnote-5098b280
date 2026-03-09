-- captcha_vector: Store CAPTCHA grid screenshots + AI/human tile selections for training
CREATE TABLE IF NOT EXISTS public.captcha_vector (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id text NOT NULL,
  attempt_round int NOT NULL,
  domain text NOT NULL,
  challenge_text text NOT NULL,
  challenge_type text,
  grid_size int NOT NULL,
  grid_screenshot_url text,
  ai_phase1_tiles integer[],
  ai_phase2_tiles integer[],
  ai_final_tiles integer[] NOT NULL,
  human_tiles integer[],
  reviewed_at timestamptz,
  notes text
);

ALTER TABLE public.captcha_vector ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access"
  ON public.captcha_vector
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Service role insert"
  ON public.captcha_vector
  FOR INSERT
  WITH CHECK (true);

-- Storage bucket for grid screenshots
INSERT INTO storage.buckets (id, name, public)
VALUES ('captcha-grids', 'captcha-grids', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Service upload captcha grids"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'captcha-grids');

CREATE POLICY "Admin read captcha grids"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'captcha-grids' AND auth.role() = 'authenticated');
