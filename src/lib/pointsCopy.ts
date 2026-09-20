/**
 * Point values quoted in UI copy (tour, missions, celebration screens).
 *
 * Source of truth is the `point_rules` table — these mirror its `base_points`
 * (checked 20 Sep 2026). If a rule changes in the database, change it here too,
 * so the app never promises a number the ledger does not pay.
 *
 *   complete_profile   100   one-time welcome bonus when onboarding completes
 *   play_match         100   completed match with a verified score
 *   win_match_bonus     25   on top of play_match
 *   referral_complete  500   when the invited friend completes their first match
 *   daily_check_in       5
 *   weekly_streak      100
 */
export const POINTS = {
  welcomeBonus: 100,
  playMatch: 100,
  winBonus: 25,
  referral: 500,
  dailyCheckIn: 5,
  weeklyStreak: 100,
} as const;

/**
 * The one exchange rate: 100 XPLAY Points = £1 (Programme Rules, Terms, Rewards page).
 * Everything that turns money into points or back goes through these helpers.
 * Server twin: supabase/functions/create-payment-intent (XP_PER_POUND).
 */
export const XP_PER_POUND = 100;
export const poundsToXp = (pounds: number): number => Math.round(pounds * XP_PER_POUND);
export const xpToPence = (xp: number): number => Math.round((xp * 100) / XP_PER_POUND);

/** Starter missions shown in the tour checklist and on a new player's profile. */
export const STARTER_MISSIONS_TOTAL = POINTS.welcomeBonus + POINTS.playMatch + POINTS.referral;
