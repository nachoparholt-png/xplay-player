CREATE POLICY "Users can delete their own active stakes"
ON public.match_stakes
FOR DELETE
TO authenticated
USING (auth.uid() = user_id AND status = 'active'::stake_status);