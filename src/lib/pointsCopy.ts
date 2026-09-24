/**
 * Point values quoted in UI copy (tour, missions, celebration screens).
 *
 * Source of truth is the `point_rules` table — these mirror its `base_points`
 * (checked 23 Sep 2026). If a rule changes in the database, change it here too,
 * so the app never promises a number the ledger does not pay.
 *
 *   complete_profile   100   one-time welcome bonus when onboarding completes
 *   play_match          50   completed match with a verified score, any club (max 3 a week)
 *   xplay_club_bonus    50   on top of play_match when the match is at an XPLAY Club
 *   win_match_bonus     25   on top of play_match (max 100 a week)
 *   referral_complete  500   when the invited friend completes their first match
 *   daily_check_in       5   max 50 a month
 *   weekly_streak       50   monthly streak: a match in each of the 4 weeks of a month
 */
export const POINTS = {
  welcomeBonus: 100,
  playMatch: 50,
  xplayClubBonus: 50,
  winBonus: 25,
  referral: 500,
  dailyCheckIn: 5,
  monthlyStreak: 50,
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
