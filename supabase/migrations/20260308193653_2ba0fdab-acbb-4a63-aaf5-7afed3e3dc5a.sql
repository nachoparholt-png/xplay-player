
-- Rewards catalog table
CREATE TABLE public.rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_name text NOT NULL,
  reward_description text,
  reward_image text,
  category text NOT NULL DEFAULT 'general',
  points_cost integer NOT NULL,
  stock_limit integer,
  current_stock integer,
  status text NOT NULL DEFAULT 'active',
  valid_from timestamp with time zone,
  valid_until timestamp with time zone,
  max_redemptions_per_user integer,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active rewards" ON public.rewards
  FOR SELECT USING (status = 'active' OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage rewards" ON public.rewards
  FOR ALL USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Reward redemptions table
CREATE TABLE public.reward_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  reward_id uuid NOT NULL REFERENCES public.rewards(id),
  points_spent integer NOT NULL,
  redemption_status text NOT NULL DEFAULT 'completed',
  redeemed_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.reward_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own redemptions" ON public.reward_redemptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all redemptions" ON public.reward_redemptions
  FOR SELECT USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert redemptions" ON public.reward_redemptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Points purchases table
CREATE TABLE public.points_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  package_name text NOT NULL,
  points_amount integer NOT NULL,
  purchase_price numeric NOT NULL,
  bonus_points integer DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.points_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own purchases" ON public.points_purchases
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create purchases" ON public.points_purchases
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all purchases" ON public.points_purchases
  FOR SELECT USING (has_role(auth.uid(), 'admin'));

-- Referrals table
CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_user_id uuid NOT NULL,
  invited_user_id uuid,
  referral_code text NOT NULL UNIQUE,
  referral_status text NOT NULL DEFAULT 'pending',
  reward_granted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own referrals" ON public.referrals
  FOR SELECT USING (auth.uid() = inviter_user_id OR auth.uid() = invited_user_id);

CREATE POLICY "Users can create referrals" ON public.referrals
  FOR INSERT WITH CHECK (auth.uid() = inviter_user_id);

CREATE POLICY "Admins can manage referrals" ON public.referrals
  FOR ALL USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Add pending_points and lifetime columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pending_points integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_earned integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_spent integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;
