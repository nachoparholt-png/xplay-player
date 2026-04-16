import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { Users, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import DateStrip from "./DateStrip";

interface OpenMatchesViewProps {
  clubId: string;
  clubName: string;
}

const OpenMatchesView = ({ clubId, clubName }: OpenMatchesViewProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [matches, setMatches] = useState<any[]>([]);
  const [players, setPlayers] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMatches = async () => {
      setLoading(true);
      const dateStr = format(selectedDate, "yyyy-MM-dd");

      const { data } = await supabase
        .from("matches")
        .select("*")
        .eq("match_date", dateStr)
        .eq("visibility", "public")
        .in("status", ["open", "confirmed"])
        .or(`club.eq.${clubName},club.eq.${clubId}`);

      const matchList = data || [];
      setMatches(matchList);

      if (matchList.length > 0) {
        const matchIds = matchList.map((m) => m.id);
        const { data: pData } = await supabase
          .from("match_players")
          .select("match_id, user_id, team, status")
          .in("match_id", matchIds)
          .eq("status", "confirmed");

        const grouped: Record<string, any[]> = {};
        (pData || []).forEach((p) => {
          if (!grouped[p.match_id]) grouped[p.match_id] = [];
          grouped[p.match_id].push(p);
        });
        setPlayers(grouped);
      } else {
        setPlayers({});
      }

      setLoading(false);
    };
    fetchMatches();
  }, [selectedDate, clubName, clubId]);

  const timeGroups = useMemo(() => {
    const groups: Record<string, any[]> = {};
    matches.forEach((m) => {
      const time = m.match_time?.slice(0, 5) || "00:00";
      if (!groups[time]) groups[time] = [];
      groups[time].push(m);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [matches]);

  return (
    <div className="space-y-5">
      <DateStrip selectedDate={selectedDate} onSelect={setSelectedDate} maxDays={14} />

      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Open Matches</h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate("/create-match")}
          className="rounded-xl text-xs gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Post Match
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : timeGroups.length === 0 ? (
        <div className="text-center py-10 space-y-2">
          <p className="text-sm text-muted-foreground">No open matches on this date</p>
          <p className="text-xs text-muted-foreground/70">Be the first to post a match!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {timeGroups.map(([time, groupMatches]) => (
            <div key={time} className="space-y-2">
              <span className="text-[11px] font-bold text-muted-foreground">{time}</span>
              {groupMatches.map((match: any) => {
                const matchPlayers = players[match.id] || [];
                const spots = match.max_players - matchPlayers.length;
                const isJoined = matchPlayers.some((p: any) => p.user_id === user?.id);

                return (
                  <button
                    key={match.id}
                    onClick={() => navigate(`/matches/${match.id}`)}
                    className="w-full bg-card rounded-2xl border border-border/50 p-4 text-left hover:border-primary/30 transition-all active:scale-[0.99]"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-primary" />
                        <span className="text-sm font-display font-bold text-foreground">{match.format}</span>
                      </div>
                      {isJoined ? (
                        <span className="text-[9px] font-bold uppercase bg-primary/15 text-primary px-2 py-0.5 rounded-full">
                          Joined
                        </span>
                      ) : spots > 0 ? (
                        <span className="text-[9px] font-bold uppercase bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full">
                          {spots} spot{spots > 1 ? "s" : ""} left
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold uppercase bg-destructive/15 text-destructive px-2 py-0.5 rounded-full">
                          Full
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span>Level {match.level_min}–{match.level_max}</span>
                      <span>•</span>
                      <span>{matchPlayers.length}/{match.max_players} players</span>
                      {match.court && <><span>•</span><span>{match.court}</span></>}
                    </div>

                    {/* Player avatars */}
                    {matchPlayers.length > 0 && (
                      <div className="flex -space-x-2 mt-2">
                        {matchPlayers.slice(0, 4).map((p: any, i: number) => (
                          <div
                            key={p.user_id}
                            className="w-6 h-6 rounded-full bg-primary/20 border-2 border-card flex items-center justify-center text-[8px] font-bold text-primary"
                          >
                            P{i + 1}
                          </div>
                        ))}
                        {matchPlayers.length > 4 && (
                          <div className="w-6 h-6 rounded-full bg-muted border-2 border-card flex items-center justify-center text-[8px] font-bold text-muted-foreground">
                            +{matchPlayers.length - 4}
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default OpenMatchesView;
