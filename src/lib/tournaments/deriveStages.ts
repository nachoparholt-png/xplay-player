export interface TournamentStage {
  key: string;
  label: string;
}

const KNOCKOUT_MAP: Record<string, TournamentStage[]> = {
  groups_only: [{ key: "groups", label: "Groups" }],
  groups_final: [
    { key: "groups", label: "Groups" },
    { key: "final", label: "Final" },
  ],
  groups_semis_final: [
    { key: "groups", label: "Groups" },
    { key: "semis", label: "Semi-Finals" },
    { key: "final", label: "Final" },
  ],
  groups_quarters_semis_final: [
    { key: "groups", label: "Groups" },
    { key: "quarters", label: "Quarter-Finals" },
    { key: "semis", label: "Semi-Finals" },
    { key: "final", label: "Final" },
  ],
  quarters_semis_final: [
    { key: "quarters", label: "Quarter-Finals" },
    { key: "semis", label: "Semi-Finals" },
    { key: "final", label: "Final" },
  ],
  semis_final: [
    { key: "semis", label: "Semi-Finals" },
    { key: "final", label: "Final" },
  ],
  final_only: [{ key: "final", label: "Final" }],
};

export function deriveTournamentStages(
  formatType: string,
  bracketConfig?: { knockout_structure?: string } | null
): TournamentStage[] {
  const fmt = formatType?.toLowerCase() || "";

  if (fmt === "americano" || fmt === "king_of_court") {
    return [{ key: "round_robin", label: "Round Robin" }];
  }

  const structure = bracketConfig?.knockout_structure || "";

  if (structure && KNOCKOUT_MAP[structure]) {
    return KNOCKOUT_MAP[structure];
  }

  // Try parsing underscore-separated structure
  if (structure) {
    const parts = structure.split("_");
    const mapped: TournamentStage[] = parts.map((p) => {
      switch (p) {
        case "groups": return { key: "groups", label: "Groups" };
        case "quarters": return { key: "quarters", label: "Quarter-Finals" };
        case "semis": return { key: "semis", label: "Semi-Finals" };
        case "final": return { key: "final", label: "Final" };
        default: return { key: p, label: p.charAt(0).toUpperCase() + p.slice(1) };
      }
    });
    if (mapped.length > 0) return mapped;
  }

  return [{ key: "tournament", label: "Tournament" }];
}
