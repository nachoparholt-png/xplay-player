
-- Drop the restrictive INSERT policy and recreate as permissive
DROP POLICY "Authenticated users can create conversations" ON public.conversations;
CREATE POLICY "Authenticated users can create conversations" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Also fix SELECT and UPDATE to be permissive
DROP POLICY "Users can view their conversations" ON public.conversations;
CREATE POLICY "Users can view their conversations" ON public.conversations
  FOR SELECT TO authenticated
  USING (is_conversation_member(auth.uid(), id));

DROP POLICY "Members can update conversations" ON public.conversations;
CREATE POLICY "Members can update conversations" ON public.conversations
  FOR UPDATE TO authenticated
  USING (is_conversation_member(auth.uid(), id));
