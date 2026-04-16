import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface TeamStanding {
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  lost: number;
  drawn: number;
  pointsFor: number;
  pointsAgainst: number;
  totalPoints: number;
}

interface GroupTableProps {
  groupId: string;
  standings: TeamStanding[];
  advanceCount: number;
}

const GroupTable = ({ groupId, standings, advanceCount }: GroupTableProps) => {
  const sorted = [...standings].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    const aDiff = a.pointsFor - a.pointsAgainst;
    const bDiff = b.pointsFor - b.pointsAgainst;
    if (bDiff !== aDiff) return bDiff - aDiff;
    return b.pointsFor - a.pointsFor;
  });

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        Group {groupId}
        <Badge variant="outline" className="text-[10px]">{sorted.length} teams</Badge>
      </h3>
      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead className="w-8">#</TableHead>
              <TableHead>Team</TableHead>
              <TableHead className="text-center w-10">P</TableHead>
              <TableHead className="text-center w-10">W</TableHead>
              <TableHead className="text-center w-10">L</TableHead>
              <TableHead className="text-center w-14">+/-</TableHead>
              <TableHead className="text-center w-10">Pts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((t, i) => (
              <TableRow
                key={t.teamId}
                className={i < advanceCount ? "bg-primary/5" : ""}
              >
                <TableCell className="text-xs font-medium">{i + 1}</TableCell>
                <TableCell className="text-sm font-medium truncate max-w-[120px]">
                  {t.teamName}
                  {i < advanceCount && (
                    <span className="ml-1 text-[9px] text-primary">▲</span>
                  )}
                </TableCell>
                <TableCell className="text-center text-xs">{t.played}</TableCell>
                <TableCell className="text-center text-xs">{t.won}</TableCell>
                <TableCell className="text-center text-xs">{t.lost}</TableCell>
                <TableCell className="text-center text-xs">
                  {t.pointsFor - t.pointsAgainst > 0 ? "+" : ""}
                  {t.pointsFor - t.pointsAgainst}
                </TableCell>
                <TableCell className="text-center text-xs font-bold">{t.totalPoints}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default GroupTable;
