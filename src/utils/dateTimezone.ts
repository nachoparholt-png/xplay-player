/**
 * dateTimezone.ts
 *
 * Timezone-aware date formatting utilities using date-fns-tz.
 *
 * All court bookings and coaching sessions store timestamps as UTC.
 * These helpers convert to the club's local timezone so players always
 * see the correct local time regardless of their browser timezone.
 */

import { format as fnsFormat } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

/** Fallback timezone — used when club.timezone is null/undefined */
const FALLBACK_TZ = 'Europe/London';

/**
 * Format a timestamp string (ISO / UTC) in a specific timezone.
 *
 * @param dateStr  ISO timestamp from the database, e.g. "2026-04-15T09:00:00+00:00"
 * @param fmt      date-fns format string, e.g. "EEE d MMM, HH:mm"
 * @param tz       IANA timezone identifier from clubs.timezone, e.g. "Europe/Madrid"
 * @returns        Formatted string in the club's local time
 */
export function formatInClubTz(
  dateStr: string | null | undefined,
  fmt: string,
  tz: string | null | undefined
): string {
  if (!dateStr) return '—';
  try {
    return formatInTimeZone(new Date(dateStr), tz || FALLBACK_TZ, fmt);
  } catch {
    // Fallback to local browser time if parsing fails or tz is invalid
    try {
      return fnsFormat(new Date(dateStr), fmt);
    } catch {
      return '—';
    }
  }
}

/**
 * Format a date-only string ("yyyy-MM-dd") — no timezone conversion needed
 * since these store calendar dates (not absolute moments).
 *
 * @param dateStr  Date-only string, e.g. "2026-04-15"
 * @param fmt      date-fns format string
 */
export function formatDateOnly(
  dateStr: string | null | undefined,
  fmt: string
): string {
  if (!dateStr) return '—';
  try {
    // Append T00:00:00 to prevent UTC-to-local shift on date-only strings
    return fnsFormat(new Date(dateStr + 'T00:00:00'), fmt);
  } catch {
    return '—';
  }
}

/**
 * Format a time-only string ("HH:mm:ss") — slice to display.
 */
export function formatTimeOnly(
  timeStr: string | null | undefined
): string {
  if (!timeStr) return '—';
  return timeStr.slice(0, 5);
}

/**
 * Get a short timezone label for display, e.g. "Madrid" from "Europe/Madrid".
 */
export function tzShortLabel(tz: string | null | undefined): string {
  if (!tz) return '';
  return tz.split('/').pop()?.replace(/_/g, ' ') ?? tz;
}
