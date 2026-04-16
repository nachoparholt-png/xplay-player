
-- Create contact_requests table
CREATE TABLE public.contact_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (sender_id, receiver_id)
);

ALTER TABLE public.contact_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own requests" ON public.contact_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can send requests" ON public.contact_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Receiver can respond" ON public.contact_requests
  FOR UPDATE TO authenticated
  USING (auth.uid() = receiver_id);

-- Security definer function for contact check
CREATE OR REPLACE FUNCTION public.are_contacts(_user_a uuid, _user_b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contact_requests
    WHERE status = 'accepted'
    AND ((sender_id = _user_a AND receiver_id = _user_b)
      OR (sender_id = _user_b AND receiver_id = _user_a))
  )
$$;
