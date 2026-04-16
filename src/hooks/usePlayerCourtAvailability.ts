import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AvailableWindow {
  start: string; // "HH:MM"
  end:   string; // "HH:MM"
}

/** All active courts for a given club (by club ID). */
export function useClubCourtsForPlayer(clubId: string | null) {
  return useQuery({
    queryKey: ['player_club_courts', clubId],
    queryFn: async () => {
      if (!clubId) return [];
      const { data, error } = await supabase
        .from('courts')
        .select('id, name, nickname, indoor, surface, slot_duration_minutes')
        .eq('club_id', clubId)
        .eq('active', true)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!clubId,
    staleTime: 60_000,
  });
}

/** Free time windows for a court + date, respecting operating hours. */
export function usePlayerCourtAvailability(
  clubId:       string | null,
  courtId:      string | null,
  date:         string | null,  // YYYY-MM-DD
  durationMins: number = 60,
) {
  return useQuery({
    queryKey: ['player_court_availability', clubId, courtId, date, durationMins],
    queryFn: async (): Promise<AvailableWindow[]> => {
      if (!clubId || !courtId || !date) return [];

      // 1. Operating hours for the day
      const jsDay = new Date(date + 'T12:00:00').getDay(); // 0=Sun
      const dbDay = (jsDay + 6) % 7;                       // 0=Mon…6=Sun

      const { data: hoursRow } = await (supabase.from('club_operating_hours') as any)
        .select('open_time, close_time, is_closed')
        .eq('club_id', clubId)
        .eq('day_of_week', dbDay)
        .maybeSingle();

      if (hoursRow?.is_closed) return [];

      const openTime:  string = hoursRow?.open_time  ?? '07:00';
      const closeTime: string = hoursRow?.close_time ?? '22:00';

      // 2. Existing (non-available) slots for this court + date
      const { data: existingSlots } = await supabase
        .from('court_slots')
        .select('start_time, end_time, status')
        .eq('court_id', courtId)
        .eq('slot_date', date)
        .neq('status', 'available');

      const occupied = (existingSlots ?? []).map(s => ({
        start: timeToMins(s.start_time),
        end:   timeToMins(s.end_time),
      }));

      // 3. Generate candidate windows at 30-min intervals within operating hours
      const openMins  = timeToMins(openTime);
      const closeMins = timeToMins(closeTime);
      const windows: AvailableWindow[] = [];

      for (let t = openMins; t + durationMins <= closeMins; t += 30) {
        const windowEnd = t + durationMins;
        const overlaps  = occupied.some(o => t < o.end && windowEnd > o.start);
        if (!overlaps) windows.push({ start: minsToTime(t), end: minsToTime(windowEnd) });
      }

      return windows;
    },
    enabled: !!clubId && !!courtId && !!date,
    staleTime: 30_000,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeToMins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

function minsToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
