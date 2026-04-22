/**
 * Haversine distance between two lat/lng points.
 * Returns distance in miles.
 */
export function distanceMiles(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

/** Format a mile distance to a short display string. */
export function formatMiles(mi: number): string {
  if (mi < 0.1) return "< 0.1 mi";
  if (mi < 10)  return `${mi.toFixed(1)} mi`;
  return `${Math.round(mi)} mi`;
}
