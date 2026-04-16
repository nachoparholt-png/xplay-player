
-- Conversation types
CREATE TYPE public.conversation_type AS ENUM ('direct', 'match');
CREATE TYPE public.message_type AS ENUM ('user_message', 'system_message');

-- Conversations table
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.conversation_type NOT NULL DEFAULT 'direct',
  match_id uuid REFERENCES public.matches(id) ON DELETE CASCADE,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(match_id)
);

-- Conversation participants
CREATE TABLE public.conversation_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  UNIQUE(conversation_id, user_id)
);

-- Messages table
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid,
  message_text text NOT NULL,
  message_type public.message_type NOT NULL DEFAULT 'user_message',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Message read receipts
CREATE TABLE public.message_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);

-- Indexes
CREATE INDEX idx_messages_conversation ON public.messages(conversation_id, created_at DESC);
CREATE INDEX idx_conversation_participants_user ON public.conversation_participants(user_id);
CREATE INDEX idx_conversation_participants_conv ON public.conversation_participants(conversation_id);
CREATE INDEX idx_message_reads_user ON public.message_reads(user_id, message_id);

-- Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

-- Security definer function to check conversation membership
CREATE OR REPLACE FUNCTION public.is_conversation_member(_user_id uuid, _conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE user_id = _user_id
      AND conversation_id = _conversation_id
      AND left_at IS NULL
  )
$$;

-- RLS Policies for conversations
CREATE POLICY "Users can view their conversations"
  ON public.conversations FOR SELECT TO authenticated
  USING (public.is_conversation_member(auth.uid(), id));

CREATE POLICY "Users can create conversations"
  ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Members can update conversations"
  ON public.conversations FOR UPDATE TO authenticated
  USING (public.is_conversation_member(auth.uid(), id));

-- RLS Policies for participants
CREATE POLICY "Users can view participants of their conversations"
  ON public.conversation_participants FOR SELECT TO authenticated
  USING (public.is_conversation_member(auth.uid(), conversation_id));

CREATE POLICY "Users can add participants"
  ON public.conversation_participants FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own participation"
  ON public.conversation_participants FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for messages
CREATE POLICY "Members can view messages"
  ON public.messages FOR SELECT TO authenticated
  USING (public.is_conversation_member(auth.uid(), conversation_id));

CREATE POLICY "Members can send messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (public.is_conversation_member(auth.uid(), conversation_id));

-- RLS Policies for message reads
CREATE POLICY "Users can view own reads"
  ON public.message_reads FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can mark messages read"
  ON public.message_reads FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants;
