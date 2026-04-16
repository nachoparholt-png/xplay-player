
INSERT INTO storage.buckets (id, name, public)
VALUES ('reward-images', 'reward-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins can upload reward images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'reward-images' AND
  public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can update reward images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'reward-images' AND
  public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can delete reward images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'reward-images' AND
  public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Anyone can view reward images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'reward-images');
