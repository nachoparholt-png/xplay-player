
-- 1. Create admin role enum and user_roles table
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 2. Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 3. RLS for user_roles: only admins can view/manage
CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 4. Create account_status enum
CREATE TYPE public.account_status AS ENUM ('active', 'inactive', 'suspended', 'blocked', 'pending_verification');

-- 5. Add missing columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS account_status account_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT now();

-- 6. Create points_transactions table
CREATE TYPE public.points_transaction_type AS ENUM (
  'earned', 'staked', 'won', 'lost', 'refunded', 'manual_adjustment', 'admin_correction'
);

CREATE TABLE public.points_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  transaction_type points_transaction_type NOT NULL,
  amount INTEGER NOT NULL,
  balance_before INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason TEXT,
  related_match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL,
  related_stake_id UUID REFERENCES public.match_stakes(id) ON DELETE SET NULL,
  admin_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.points_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all transactions" ON public.points_transactions
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own transactions" ON public.points_transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can insert transactions" ON public.points_transactions
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 7. Create admin_notes table
CREATE TABLE public.admin_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id UUID NOT NULL,
  admin_user_id UUID NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all notes" ON public.admin_notes
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can create notes" ON public.admin_notes
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete notes" ON public.admin_notes
  FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- 8. Admin policy for profiles: admins can view and update all profiles
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- 9. Admin policies for match_stakes
CREATE POLICY "Admins can view all stakes" ON public.match_stakes
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- 10. Admin policy for match_players
CREATE POLICY "Admins can view all match players" ON public.match_players
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
