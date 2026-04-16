export type PaceStatus = "green" | "yellow" | "red" | "blue";

export interface PaceInfo {
  elapsedMins: number;
  completedMatches: number;
  totalMatches: number;
  estimatedTotalMins: number;
  projectedFinishMins: number;
  deltaMins: number;
  status: PaceStatus;
}

export function computePace(
  startedAt: string | null,
  completedMatches: number,
  totalMatches: number,
  estimatedTotalMins: number
): PaceInfo {
  if (!startedAt || totalMatches === 0) {
    return {
      elapsedMins: 0,
      completedMatches,
      totalMatches,
      estimatedTotalMins,
      projectedFinishMins: estimatedTotalMins,
      deltaMins: 0,
      status: "green",
    };
  }

  const elapsed = (Date.now() - new Date(startedAt).getTime()) / 60000;
  const progress = completedMatches / totalMatches;
  const projected = progress > 0 ? elapsed / progress : estimatedTotalMins;
  const delta = projected - estimatedTotalMins;

  let status: PaceStatus;
  if (completedMatches >= totalMatches) {
    status = "blue"; // finished
  } else if (delta <= 5) {
    status = "green";
  } else if (delta <= 15) {
    status = "yellow";
  } else {
    status = "red";
  }

  return {
    elapsedMins: Math.round(elapsed),
    completedMatches,
    totalMatches,
    estimatedTotalMins,
    projectedFinishMins: Math.round(projected),
    deltaMins: Math.round(delta),
    status,
  };
}

export function formatMins(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
