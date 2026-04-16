CREATE POLICY "Creators can delete their tournaments"
ON public.tournaments
FOR DELETE
TO authenticated
USING (auth.uid() = created_by);