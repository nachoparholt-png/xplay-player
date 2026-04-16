
-- Fix overly permissive INSERT policies
DROP POLICY "Users can create conversations" ON public.conversations;
CREATE POLICY "Authenticated users can create conversations"
  ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY "Users can add participants" ON public.conversation_participants;
CREATE POLICY "Members can add participants to their conversations"
  ON public.conversation_participants FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id 
    OR public.is_conversation_member(auth.uid(), conversation_id)
  );
