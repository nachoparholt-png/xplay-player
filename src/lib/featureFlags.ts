/**
 * XPLAY feature flags
 *
 * Single source of truth for gating features that exist in the codebase but
 * should not currently be shown to users.
 *
 * ─── STAKES_ENABLED ──────────────────────────────────────────────────────────
 * The original stakes/wagering/betting workflow was paused (May 2026) because
 * money-in/money-out wagering triggers the UK Gambling Act 2005 and would
 * require a Gambling Commission licence. The code remains in the repo so that
 * if a licence is obtained the feature can be reactivated by flipping this flag
 * to `true`.
 *
 * Files preserved behind this flag include (non-exhaustive):
 *   - src/pages/ActiveStakes.tsx
 *   - src/components/betting/ (TournamentBetSheet, MatchBetSheet, PotentialWinPreview)
 *   - src/components/tournaments/BetBanner.tsx
 *   - src/components/tournaments/MyBetsTab.tsx
 *   - src/components/EditStakeModal.tsx
 *   - src/components/BetModal.tsx
 *   - src/components/MatchBettingSection.tsx
 *   - src/components/rewards/StakeOptionsSection.tsx
 *   - src/pages/admin/AdminBettingSettings.tsx
 *   - src/pages/tournaments/TournamentBetConfig.tsx
 *   - src/lib/betting.ts (odds calc — may also be reused for skill-based predictions)
 *   - src/lib/tournaments/betSettlement.ts
 *   - src/lib/tournaments/withdrawalEngine.ts
 *
 * Database tables (kept in place, not dropped):
 *   - match_bet_config
 *   - any *_stakes / *_bets / *_wagers / withdrawals tables
 *
 * Reactivation procedure:
 *   1. Obtain a UK Gambling Commission licence (or equivalent in jurisdiction)
 *   2. Update T&Cs / age verification / KYC / responsible-gambling messaging
 *   3. Flip STAKES_ENABLED to true here AND in xplay-club-vercel/src/lib/featureFlags.ts
 *   4. Run smoke tests on each preserved component listed above
 *
 * ─── LOYALTY_ENABLED ─────────────────────────────────────────────────────────
 * Master switch for the XPLAY Points loyalty programme (replaces stakes as the
 * engagement-and-reward layer). Default ON. Anchor: 100 pts = £1 of catalogue
 * value. See `XPLAY_Rewards_Program_Design.html` for the full design document.
 *
 * ─── XPLAY_PRO_ENABLED ───────────────────────────────────────────────────────
 * Switch for the XPLAY Pro premium subscription tier. Default OFF until the
 * subscription product is created in Stripe and the in-app paywall is live.
 */

export const STAKES_ENABLED = false;
export const LOYALTY_ENABLED = true;
export const XPLAY_PRO_ENABLED = false;

/**
 * ─── AVAILABILITY_ENABLED ────────────────────────────────────────────────────
 * Layer 2 of the club directory (XPLAY_Club_Data_Availability_Design.md):
 * aggregated court availability for non-XPLAY ("directory") clubs, collected
 * from external providers (Playtomic first) and shown read-only with a
 * deep-link to book on the host platform. Collectors are the most fragile
 * part of the stack — flip this OFF to fall back to directory-only if a
 * provider blocks or changes their endpoints. DB-side kill switch also
 * exists: app_settings key 'availability_playtomic_enabled'.
 */
export const AVAILABILITY_ENABLED = true;

/**
 * ─── POINTS_PURCHASE_ENABLED ─────────────────────────────────────────────────
 * Buying XPLAY Points for cash is the second bright legal line we cannot cross
 * (rule 2 of the rewards programme design — never sell points for money). If a
 * user can convert money → points and then redeem points → goods, the points
 * have become e-money under EMRs 2011 / PSR 2017. Premium subscribers earn a
 * multiplier; they do not buy points. Default OFF and likely to stay OFF.
 */
export const POINTS_PURCHASE_ENABLED = false;
