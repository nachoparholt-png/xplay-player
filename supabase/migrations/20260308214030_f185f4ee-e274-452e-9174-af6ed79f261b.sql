
-- 1. Create stores table
CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name text NOT NULL,
  website_url text,
  store_logo text,
  store_description text,
  redemption_instructions text,
  store_status text NOT NULL DEFAULT 'active',
  contact_email text,
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage stores" ON public.stores FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can read active stores" ON public.stores FOR SELECT
  USING (store_status = 'active' OR has_role(auth.uid(), 'admin'::app_role));

-- 2. Add columns to rewards
ALTER TABLE public.rewards
  ADD COLUMN IF NOT EXISTS linked_store_id uuid REFERENCES public.stores(id),
  ADD COLUMN IF NOT EXISTS stock_status text NOT NULL DEFAULT 'in_stock',
  ADD COLUMN IF NOT EXISTS redemption_instructions text;

-- 3. Add linked_store_id to reward_codes
ALTER TABLE public.reward_codes
  ADD COLUMN IF NOT EXISTS linked_store_id uuid REFERENCES public.stores(id);

-- 4. Add linked_store_id to reward_redemptions
ALTER TABLE public.reward_redemptions
  ADD COLUMN IF NOT EXISTS linked_store_id uuid REFERENCES public.stores(id);

-- 5. Insert default gift card settings
INSERT INTO public.app_settings (key, value, description) VALUES
  ('stock_status_mode', 'automatic_from_code_inventory', 'How stock status is determined: automatic_from_code_inventory, manual_override_allowed, hybrid'),
  ('allow_manual_stock_override', 'true', 'Allow admins to manually override stock status'),
  ('require_reward_store_mapping', 'false', 'Require each reward to be linked to a store'),
  ('max_redemptions_per_user_default', '0', 'Default max redemptions per user (0 = unlimited)'),
  ('stock_alerts_enabled', 'true', 'Enable low stock and expiring code alerts'),
  ('gift_card_section_title', 'Gift Cards & Codes', 'Title for the gift card rewards section')
ON CONFLICT (key) DO NOTHING;
