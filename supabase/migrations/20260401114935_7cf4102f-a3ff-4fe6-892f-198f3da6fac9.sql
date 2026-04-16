
INSERT INTO storage.buckets (id, name, public)
VALUES ('club-assets', 'club-assets', true);

CREATE POLICY "Club assets are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'club-assets');

CREATE POLICY "Club admins can upload club assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'club-assets' AND auth.uid() IS NOT NULL);

CREATE POLICY "Club admins can update club assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'club-assets' AND auth.uid() IS NOT NULL);

CREATE POLICY "Club admins can delete club assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'club-assets' AND auth.uid() IS NOT NULL);
