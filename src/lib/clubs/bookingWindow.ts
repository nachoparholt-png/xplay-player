import { supabase } from "@/integrations/supabase/client";

/**
 * Returns the max number of days in advance a user can book a court at a club.
 */
export async function getBookingWindow(clubId: string, userId: string): Promise<number> {
  // Check user membership tier
  const { data: membership } = await supabase
    .from("club_memberships")
    .select("*")
    .eq("user_id", userId)
    .eq("club_id", clubId)
    .eq("active", true)
    .maybeSingle();

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
