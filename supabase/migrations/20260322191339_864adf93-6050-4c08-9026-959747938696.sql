
-- Products table for marketplace
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_product_id text,
  shopify_variant_id text,
  title text NOT NULL,
  description text,
  image_url text,
  point_price integer NOT NULL DEFAULT 0,
  cash_price_cents integer NOT NULL DEFAULT 0,
  stock integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  category text NOT NULL DEFAULT 'general',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Redemption orders table
CREATE TABLE public.redemption_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id),
  points_used integer NOT NULL DEFAULT 0,
  cash_paid_cents integer NOT NULL DEFAULT 0,
  stripe_payment_intent_id text,
  shopify_order_id text,
  status text NOT NULL DEFAULT 'pending',
  shipping_address jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS on products
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active products"
  ON public.products FOR SELECT
  USING (active = true OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage products"
  ON public.products FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS on redemption_orders
ALTER TABLE public.redemption_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own orders"
  ON public.redemption_orders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own orders"
  ON public.redemption_orders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all orders"
  ON public.redemption_orders FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage orders"
  ON public.redemption_orders FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime on redemption_orders
ALTER PUBLICATION supabase_realtime ADD TABLE public.redemption_orders;

-- Updated_at trigger for both tables
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_redemption_orders_updated_at
  BEFORE UPDATE ON public.redemption_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
