
-- Drop restrictive policies and recreate as permissive for conversations
DROP POLICY IF EXISTS "Authenticated users can create conversations" ON public.conversations;
DROP POLICY IF EXISTS "Members can update conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can view their conversations" ON public.conversations;

CREATE POLICY "Authenticated users can create conversations"
ON public.conversations FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Members can update conversations"
ON public.conversations FOR UPDATE TO authenticated
USING (is_conversation_member(auth.uid(), id));

CREATE POLICY "Users can view their conversations"
ON public.conversations FOR SELECT TO authenticated
USING (is_conversation_member(auth.uid(), id));

-- Fix conversation_participants policies too
DROP POLICY IF EXISTS "Members can add participants to their conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can update own participation" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can view participants of their conversations" ON public.conversation_participants;

CREATE POLICY "Members can add participants to their conversations"
ON public.conversation_participants FOR INSERT TO authenticated
WITH CHECK ((auth.uid() = user_id) OR is_conversation_member(auth.uid(), conversation_id));

CREATE POLICY "Users can update own participation"
ON public.conversation_participants FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can view participants of their conversations"
ON public.conversation_participants FOR SELECT TO authenticated
USING (is_conversation_member(auth.uid(), conversation_id));

-- Fix messages policies too
DROP POLICY IF EXISTS "Members can send messages" ON public.messages;
DROP POLICY IF EXISTS "Members can view messages" ON public.messages;

CREATE POLICY "Members can send messages"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (is_conversation_member(auth.uid(), conversation_id));

CREATE POLICY "Members can view messages"
ON public.messages FOR SELECT TO authenticated
USING (is_conversation_member(auth.uid(), conversation_id));

-- Fix message_reads policies
DROP POLICY IF EXISTS "Users can mark messages read" ON public.message_reads;
DROP POLICY IF EXISTS "Users can view own reads" ON public.message_reads;

CREATE POLICY "Users can mark messages read"
ON public.message_reads FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own reads"
ON public.message_reads FOR SELECT TO authenticated
USING (auth.uid() = user_id);
