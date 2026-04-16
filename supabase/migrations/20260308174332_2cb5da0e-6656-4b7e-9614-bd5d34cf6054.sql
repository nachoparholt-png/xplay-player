
-- Fix overly permissive INSERT policy on notifications
DROP POLICY "Service role can insert notifications" ON public.notifications;

-- Allow users to insert their own notifications (edge functions use service role which bypasses RLS)
CREATE POLICY "Users can insert own notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
