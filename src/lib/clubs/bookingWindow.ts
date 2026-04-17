import { supabase } from "@/integrations/supabase/client";

/**
 * Returns the max number of days in advance a user can book a court at a club.
 */
export async function getBookingWindow(clubId: string, userId: string): Promise<number> {
  // Check user membership tier — use status='active' + expiry guard
  const now = new Date().toISOString();
  const { data: memberships } = await supabase
    .from("club_memberships")
    .select("tier_id, expires_at")
    .eq("user_id", userId)
    .eq("club_id", clubId)
    .eq("status", "active");

  const membership = (memberships || []).find(
    (m) => !m.expires_at || m.expires_at > now
  ) ?? null;

  const tierId = membership?.tier_id;
  if (tierId) {
    const { data: tier } = await supabase
      .from("membership_tiers")
      .select("advance_booking_days")
      .eq("id", tierId)
      .single();
    if (tier) return tier.advance_booking_days;
  }

  // Fall back to club default
  const { data: club } = await supabase
    .from("clubs")
    .select("*")
    .eq("id", clubId)
    .single();

  return club?.default_advance_days ?? 3;
}
