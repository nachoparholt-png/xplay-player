/** Normalize a string for fuzzy comparison: lowercase, remove spaces/punctuation */
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Score how well two strings match (0 = no match, higher = better) */
const fuzzyScore = (needle: string, haystack: string): number => {
  const n = normalize(needle);
  const h = normalize(haystack);
  if (n === h) return 100;
  if (h.includes(n) || n.includes(h)) return 80;

  // Word-based: count how many words from the haystack appear in the needle
  const haystackWords = haystack.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const needleNorm = needle.toLowerCase();
  const matchedWords = haystackWords.filter((w) => needleNorm.includes(w));
  if (matchedWords.length >= 2) return matchedWords.length * 20;

  return 0;
};

/** Parse a Playtomic-style clipboard text into form fields */
export const parsePlaytomicClipboard = (text: string) => {
  const result: {
    clubName?: string;
    location?: string;
    date?: Date;
    time?: string;
    players: { name: string; level: number }[];
  } = { players: [] };

  // Club name: *MATCH IN <CLUB NAME>*
  const clubMatch = text.match(/\*MATCH\s+IN\s+(.+?)\*/i);
  if (clubMatch) {
    result.clubName = clubMatch[1].trim();
  }

  // Date & time: 📅 Sunday 22, 10:00 (60min)
  const dateTimeMatch = text.match(/📅\s*\w+\s+(\d{1,2}),?\s*(\d{1,2}:\d{2})/);
  if (dateTimeMatch) {
    const day = parseInt(dateTimeMatch[1]);
    const timeStr = dateTimeMatch[2];

    const now = new Date();
    let targetDate = new Date(now.getFullYear(), now.getMonth(), day);
    if (targetDate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      targetDate = new Date(now.getFullYear(), now.getMonth() + 1, day);
    }
    result.date = targetDate;

    const [h, m] = timeStr.split(":").map(Number);
    const snappedMin = m < 15 ? "00" : m < 45 ? "30" : "00";
    const snappedHour = m >= 45 ? h + 1 : h;
    result.time = `${snappedHour.toString().padStart(2, "0")}:${snappedMin}`;
  }

  // Location: 📍 <Location>
  const locMatch = text.match(/📍\s*(.+)/);
  if (locMatch) {
    result.location = locMatch[1].trim();
  }

  // Players: ✅ Name (level)
  const playerRegex = /✅\s*(.+?)\s*\((\d+(?:\.\d+)?)\)/g;
  let pm;
  while ((pm = playerRegex.exec(text)) !== null) {
    result.players.push({ name: pm[1].trim(), level: parseFloat(pm[2]) });
  }

  return result;
};

/** Find the best matching club from a list given a parsed club name */
export const findBestClubMatch = <T extends { club_name: string }>(
  clubs: T[],
  clipboardClubName: string
): T | null => {
  let bestClub: T | null = null;
  let bestScore = 0;

  for (const club of clubs) {
    const score = fuzzyScore(clipboardClubName, club.club_name);
    if (score > bestScore) {
      bestScore = score;
      bestClub = club;
    }
  }

  return bestScore >= 40 ? bestClub : null;
};
