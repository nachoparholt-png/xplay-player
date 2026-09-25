/**
 * Favourite clubs (25 Sep 2026) — a star on the club page, kept on this phone only.
 * Home puts the first favourite club at the top of "Play at your clubs".
 */
const KEY = "xplay.favouriteClubs";

export const favouriteClubIds = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch { return []; }
};

export const isFavouriteClub = (id: string) => favouriteClubIds().includes(id);

/** Returns the new state (true = now a favourite). */
export const toggleFavouriteClub = (id: string): boolean => {
  const ids = favouriteClubIds();
  const on = !ids.includes(id);
  const next = on ? [id, ...ids] : ids.filter((x) => x !== id);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return on;
};
