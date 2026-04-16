
-- Add new columns to rewards table for code-based inventory
ALTER TABLE public.rewards
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'internal_coupon',
  ADD COLUMN IF NOT EXISTS code_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_mode text NOT NULL DEFAULT 'manual_quantity_stock',
  ADD COLUMN IF NOT EXISTS external_store_name text,
  ADD COLUMN IF NOT EXISTS external_quantity integer,
  ADD COLUMN IF NOT EXISTS low_stock_threshold integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS admin_notes text;

-- Add new columns to reward_redemptions for code delivery
ALTER TABLE public.reward_redemptions
  ADD COLUMN IF NOT EXISTS reward_code_id uuid,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_message text;

-- Create reward_codes table
CREATE TABLE public.reward_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_id uuid NOT NULL REFERENCES public.rewards(id) ON DELETE CASCADE,
  unique_code text NOT NULL,
  source_reference text,
  code_status text NOT NULL DEFAULT 'available',
  expiration_date timestamptz,
  imported_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz,
  redeemed_by_user_id uuid,
  admin_note text,
  priority_order integer DEFAULT 0,
  UNIQUE(reward_id, unique_code)
);

ALTER TABLE public.reward_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage reward codes"
  ON public.reward_codes FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own redeemed codes"
  ON public.reward_codes FOR SELECT
  TO authenticated
  USING (redeemed_by_user_id = auth.uid());

-- Create reward_stock_audit table
CREATE TABLE public.reward_stock_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_id uuid NOT NULL REFERENCES public.rewards(id) ON DELETE CASCADE,
  previous_external_quantity integer,
  new_external_quantity integer,
  changed_by_admin_id uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  change_reason text
);

ALTER TABLE public.reward_stock_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage stock audit"
  ON public.reward_stock_audit FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add foreign key from reward_redemptions to reward_codes
ALTER TABLE public.reward_redemptions
  ADD CONSTRAINT reward_redemptions_reward_code_id_fkey
  FOREIGN KEY (reward_code_id) REFERENCES public.reward_codes(id);

-- Seed code inventory settings
INSERT INTO public.app_settings (key, value, description) VALUES
  ('enable_code_based_rewards', 'true', 'Enable code-based reward fulfillment'),
  ('code_assignment_method', 'fifo_import_order', 'How to assign codes: fifo_import_order, earliest_expiry_first, manual_priority'),
  ('reservation_enabled', 'false', 'Reserve codes during checkout before confirmation'),
  ('reservation_timeout_minutes', '10', 'Minutes before reserved code is released'),
  ('require_external_quantity_check', 'false', 'Check external store quantity before redemption'),
  ('stock_availability_mode', 'use_code_inventory_only', 'Stock mode: use_code_inventory_only, use_external_quantity_only, require_both_code_and_external_quantity'),
  ('low_stock_threshold_default', '5', 'Default low stock warning threshold'),
  ('expiring_code_warning_days', '7', 'Days before expiry to show warning'),
  ('allow_manual_external_quantity_update', 'true', 'Allow admins to manually update external quantity')
ON CONFLICT (key) DO NOTHING;
