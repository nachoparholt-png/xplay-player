# XPLAY Player App — Cowork Context

## What This Is
XPLAY is a padel sports platform. This repo (`xplay-capacitor-ready`) is the **player-facing app** — a React + Vite + Capacitor app deployed to:
- **Web:** https://xplay-player.vercel.app
- **iOS:** TestFlight / App Store (Capacitor, bundled mode — no remote URL)

The **club-facing app** is in the sibling folder `xplay-club-vercel` → https://xplayapps.com

## Stack
- React + Vite + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (project ID: `cdctssarfcipdizvynxi`, URL: `https://cdctssarfcipdizvynxi.supabase.co`)
- Capacitor for iOS (bundled — `capacitor.config.ts` has no `server.url`)
- Shopify Storefront API for the marketplace
- Stripe for membership payments
- Google Maps Places API for venue search

## Key Commands
```bash
npm run dev           # local dev server
npm run build         # production build
npx cap sync ios      # sync to Xcode after build
npx vercel --prod     # deploy web to Vercel
```
After code changes → always: `npm run build && npx cap sync ios` → then archive in Xcode for TestFlight.

## Architecture
```
src/
├── pages/            # Route-level pages (Matches, Tournaments, Shop, Profile, etc.)
├── components/       # Shared UI components
│   ├── marketplace/  # ProductCard, ProductQuickView, RedeemConfirmModal
│   ├── clubs/        # MembershipCard, BookingSlotModal, ClubPicker
│   └── ...
├── hooks/            # useAuth, usePushNotifications, useGooglePlaces, etc.
├── contexts/         # AuthContext (user, profile, refreshProfile)
├── integrations/supabase/  # client.ts, types.ts
└── lib/              # shopify.ts, parsePlaytomic.ts, utils.ts
```

## Points Currency
Points are called **XPLAY Points (XP)** in the UI. The DB column is `profiles.padel_park_points`. All UI labels use "XP" — never "PP" (old name).

## Push Notifications (APNs)
- Hook: `src/hooks/usePushNotifications.ts` — called in `App.tsx` inside `AppRoutes`
- Registers device token to `profiles.push_token`
- Supabase secrets set: `APNS_PRIVATE_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`
- Xcode: Push Notifications capability added to both Debug and Release signing

## Membership / Stripe
- Edge function: `supabase/functions/purchase-membership/index.ts`
- Uses `stripe@14.21.0` with `apiVersion: "2023-10-16"` (important — do NOT upgrade to named versions like `2025-08-27.basil`, they crash the Deno module)
- `STRIPE_SECRET_KEY` is set in Supabase secrets
- Staff tier (`tier_tag = 'staff'`) is filtered out of the player-facing membership list
- Staff role card only shows for roles: `["staff", "manager", "coach", "admin"]` — NOT for "owner" or "member"

## iOS / Capacitor Notes
- **Font size rule:** All `<input>` and `<textarea>` elements MUST have `style={{ fontSize: "16px" }}` — iOS Safari zooms in on focus if font-size < 16px and never zooms back out
- **No autoFocus in modals** — same zoom trigger on iOS
- **Safe area:** Use `style={{ paddingBottom: "env(safe-area-inset-bottom, 16px)" }}` for bottom sheets — `pb-safe` Tailwind class is NOT configured
- **Google Places on Capacitor:** API key must allow referrer `capacitor://localhost/*` in Google Cloud Console (project: `xplay-492111`, key: "Maps Platform API Key")
- Capacitor origin is `capacitor://localhost` — added to Maps API key allowed referrers

## Google Places Fallback
`src/hooks/useGooglePlaces.ts` has an 8-second timeout + error state. `src/components/PlacesVenueInput.tsx` falls back to a plain text input when Places fails to load (shows `failed` state).

## Club / Venue Selection (Match Creation)
`ClubPicker`, `CreateMatch`, `CreateMatchModal` all use this `ClubSelection` type:
```typescript
type ClubSelection = {
  id: string;
  club_name: string;
  location: string;      // NOT approximate_location (that column doesn't exist)
  city: string | null;
};
// Query: .select("id, club_name, location, city")
```
Columns that do NOT exist in `clubs` table: `approximate_location`, `number_of_courts`, `main_court_type`, `typical_active_hours`. Court field is a plain `<Input>` — not a Select dropdown.

## Marketplace / Shop — Option 2: Shopify as Single Source of Truth

**Architecture (implemented):**
- Shopify is the single source of truth for inventory, stock, and product availability
- Local `products` table is still used for linking products and as XP price fallback, but stock is never managed locally
- All three purchase paths create a Shopify order → Shopify handles fulfillment, email confirmation, shipping, returns

**XP Price resolution priority** (`src/lib/shopify.ts → resolveXpPrice()`):
1. Shopify metafield `custom.xplay_points_price` (integer, set per-product in Shopify Admin)
2. Local DB `products.point_price` (fallback while migrating)
3. Formula: `ceil(price_gbp * 10)` (last resort)

**Stock/availability:** `shopifyInStock(product)` checks `product.node.availableForSale` — never uses local DB stock

**Three purchase paths:**
1. **Full XP redeem** → `supabase/functions/redeem-product` → checks Shopify variant availability → creates £0.00 Shopify order (auto-decrements inventory) → records in `redemption_orders`
2. **Hybrid XP+Card** → `supabase/functions/create-payment-intent` → Stripe checkout → `stripe-webhook` catches `checkout.session.completed` with `type: product_redemption` → deducts XP + creates Shopify order
3. **Cash (Shopify cart)** → native Shopify checkout, no Supabase involvement

**To add a new reward product:**
1. Create product in Shopify Admin, set inventory there
2. In Shopify: add metafield `custom.xplay_points_price` (integer) = XP price
3. In Shopify Admin → Settings → Custom data: enable `xplay_points_price` metafield for Storefront API access
4. In XPLAY Admin Products page: paste Shopify Product GID → click ↓ to auto-fill → save

**Important:** `shopify_variant_id` on the local product must be set for XP redemption to work (edge function uses it to create the Shopify order). Auto-filled when you click ↓ in Admin Products.

## Profile Photo Upload
`src/pages/ProfileSettings.tsx` — camera badge always visible (bottom-right of avatar), "Tap to change photo" label. Uploads to Supabase Storage `avatars` bucket.

## Known Pending Items
- Deploy web fixes to Vercel: `npx vercel --prod` (from xplay-capacitor-ready)
- Archive new build for TestFlight (after `npm run build && npx cap sync ios`)
- Korde Speed Balls linked in DB (shopify_product_id + shopify_variant_id set). Still needed: set `custom.xplay_points_price = 70` metafield in Shopify Admin, and enable metafield for Storefront API access
- Schema cleanup deferred: `memberships`, `member_subscriptions`, `club_membership_plans` tables still referenced in club app

## Supabase Edge Functions (player app)
| Function | Purpose | Notes |
|---|---|---|
| `purchase-membership` | Stripe checkout for paid tiers | stripe@14.21.0, apiVersion 2023-10-16 |
| `cancel-membership` | Cancel Stripe subscription | |
| `redeem-product` | Redeem product with XP | Checks Shopify variant availability, creates £0.00 Shopify order |
| `create-payment-intent` | Hybrid XP+card payment | Stripe checkout → stripe-webhook creates Shopify order |
| `stripe-webhook` | All Stripe webhook events | verify_jwt: false; handles memberships, bookings, product redemption |
| `create-match-market` | Betting market for new match | |
| `membership-renewal-reminders` | APNs push notifications | v8, uses APNS_* secrets |
