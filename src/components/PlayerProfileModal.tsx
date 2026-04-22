import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMatchChat } from "@/hooks/useMatchChat";
import { MapPin, Bolt, Crosshair, Gauge, Trophy, Swords, Minus, Calendar, MessageSquare, Medal } from "lucide-react";
import { format } from "date-fns";

interface PlayerProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerId: string | null;
  /** When true, show a "Message" button that bypasses the contact-check (e.g. match co-participants) */
  allowDirectMessage?: boolean;
}

interface PlayerProfile {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  padel_level: number | null;
  location: string | null;
  dominant_hand: string | null;
  preferred_side: string | null;
  total_matches: number;
  wins: number;
  losses: number;
  reliability_score: number;
}

interface HeadToHead {
  total: number;
  wins: number;
  losses: number;
  draws: number;
}

interface H2HMatch {
  match_id: string;
  date: string;
  club: string;
  result: "win" | "loss" | "draw";
  score: string;
  myTeamLabel: string;
}

const levelToCategory = (level: number | null): number => {
  if (!level) return 5;
  if (level >= 6) return 1;
  if (level >= 4.5) return 2;
  if (level >= 3) return 3;
  if (level >= 1.5) return 4;
  return 5;
};

const PlayerProfileModal = ({ open, onOpenChange, playerId, allowDirectMessage }: PlayerProfileModalProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { getOrCreateDirectChat } = useMatchChat();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [h2h, setH2h] = useState<HeadToHead>({ total: 0, wins: 0, losses: 0, draws: 0 });
  const [h2hMatches, setH2hMatches] = useState<H2HMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingChat, setStartingChat] = useState(false);
  const [tierName, setTierName] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !playerId) return;
    setLoading(true);

    const fetchData = async () => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url, padel_level, location, dominant_hand, preferred_side, total_matches, wins, losses, reliability_score")
        .eq("user_id", playerId)
        .single();

      setProfile(prof as PlayerProfile | null);

      // Fetch player's highest active club membership tier
      const { data: memberships } = await supabase
        .from("club_memberships")
        .select("tier_id, membership_tiers(name, sort_order)")
        .eq("user_id", playerId)
        .eq("active", true)
        .not("tier_id", "is", null)
        .order("created_at", { ascending: false });

      if (memberships && memberships.length > 0) {
        // Pick the tier with the lowest sort_order (most premium)
        const sorted = [...memberships].sort((a, b) => {
          const aOrder = (a.membership_tiers as any)?.sort_order ?? 99;
          const bOrder = (b.membership_tiers as any)?.sort_order ?? 99;
          return aOrder - bOrder;
        });
        setTierName((sorted[0].membership_tiers as any)?.name ?? null);
      } else {
        setTierName(null);
      }

      if (user && user.id !== playerId) {
        const { data: myMatches } = await supabase
          .from("match_players")
          .select("match_id, team")
          .eq("user_id", user.id)
          .eq("status", "confirmed");

        const { data: theirMatches } = await supabase
          .from("match_players")
          .select("match_id, team")
          .eq("user_id", playerId)
          .eq("status", "confirmed");

        if (myMatches && theirMatches) {
          const myMatchMap = new Map(myMatches.map(m => [m.match_id, m.team]));
          const theirMatchMap = new Map(theirMatches.map(m => [m.match_id, m.team]));
          const commonMatchIds = theirMatches
            .filter(m => myMatchMap.has(m.match_id))
            .map(m => m.match_id);

          if (commonMatchIds.length > 0) {
            const { data: completedMatches } = await supabase
              .from("matches")
              .select("id, status, match_date, club")
              .in("id", commonMatchIds)
              .in("status", ["confirmed", "completed", "closed_as_draw", "draw"])
              .order("match_date", { ascending: false });

            if (completedMatches && completedMatches.length > 0) {
              const completedIds = completedMatches.map(m => m.id);
              const matchInfoMap = new Map(completedMatches.map(m => [m.id, m]));

              const { data: submissions } = await supabase
                .from("score_submissions")
                .select("match_id, result_type, status, team_a_set_1, team_b_set_1, team_a_set_2, team_b_set_2, team_a_set_3, team_b_set_3")
                .in("match_id", completedIds)
                .eq("status", "validated");

              let wins = 0, losses = 0, draws = 0;
              const matchDetails: H2HMatch[] = [];

              (submissions || []).forEach(sub => {
                const myTeam = myMatchMap.get(sub.match_id);
                const theirTeam = theirMatchMap.get(sub.match_id);
                const matchInfo = matchInfoMap.get(sub.match_id);

                if (myTeam && theirTeam && myTeam !== theirTeam && matchInfo) {
                  const score = [
                    sub.team_a_set_1 != null ? `${sub.team_a_set_1}-${sub.team_b_set_1}` : null,
                    sub.team_a_set_2 != null ? `${sub.team_a_set_2}-${sub.team_b_set_2}` : null,
                    sub.team_a_set_3 != null ? `${sub.team_a_set_3}-${sub.team_b_set_3}` : null,
                  ].filter(Boolean).join(" / ");

                  let result: "win" | "loss" | "draw" = "draw";
                  if (sub.result_type === "draw") {
                    draws++;
                  } else if (
                    (sub.result_type === "team_a_win" && myTeam === "A") ||
                    (sub.result_type === "team_b_win" && myTeam === "B")
                  ) {
                    wins++;
                    result = "win";
                  } else {
                    losses++;
                    result = "loss";
                  }

                  matchDetails.push({
                    match_id: sub.match_id,
                    date: matchInfo.match_date,
                    club: matchInfo.club,
                    result,
                    score: score || (sub.result_type === "draw" ? "Draw" : "N/A"),
                    myTeamLabel: myTeam === "A" ? "Team A" : "Team B",
                  });
                }
              });

              // Sort by date descending
              matchDetails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

              setH2h({ total: wins + losses + draws, wins, losses, draws });
              setH2hMatches(matchDetails);
            } else {
              setH2h({ total: 0, wins: 0, losses: 0, draws: 0 });
              setH2hMatches([]);
            }
          } else {
            setH2h({ total: 0, wins: 0, losses: 0, draws: 0 });
            setH2hMatches([]);
          }
        }
      }

      setLoading(false);
    };

    fetchData();
  }, [open, playerId, user]);

  const winRate = profile && profile.total_matches > 0
    ? `${Math.round((profile.wins / profile.total_matches) * 100)}%`
    : "0%";

  const reliabilityLabel = (profile?.reliability_score ?? 100) >= 90 ? "HIGH" : (profile?.reliability_score ?? 100) >= 70 ? "MED" : "LOW";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0 rounded-2xl overflow-hidden bg-background border-border max-h-[85vh]">
        <DialogTitle className="sr-only">Player Profile</DialogTitle>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : profile ? (
          <ScrollArea className="max-h-[80vh]">
            <div className="space-y-5 p-6">
              {/* Hero */}
              <div className="flex flex-col items-center">
                <div className="relative">
                  <div className="w-24 h-24 rounded-full p-0.5 bg-gradient-to-tr from-primary to-accent shadow-lg">
                    <Avatar className="w-full h-full">
                      <AvatarImage src={profile.avatar_url || ""} className="object-cover" />
                      <AvatarFallback className="text-2xl font-black bg-surface-container">
                        {profile.display_name?.[0]?.toUpperCase() || "P"}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  {profile.padel_level && (
                    <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground font-black px-2 py-0.5 rounded-full text-sm shadow-lg">
                      {profile.padel_level.toFixed(1)}
                    </div>
                  )}
                </div>

                <h2 className="mt-4 text-xl font-display font-extrabold tracking-tight uppercase italic">
                  {profile.display_name || "Player"}
                </h2>
                <p className="text-muted-foreground text-xs uppercase flex items-center gap-1.5 font-medium tracking-wide">
                  <MapPin className="w-3 h-3" />
                  {levelToCategory(profile.padel_level) <= 2 ? "Advanced" : "Intermediate"} Player
                  {profile.location ? ` · ${profile.location}` : ""}
                </p>
                {tierName && (
                  <div className={`mt-2 flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${
                    tierName.toLowerCase().includes("platinum")
                      ? "bg-purple-500/15 text-purple-400 border-purple-500/30"
                      : tierName.toLowerCase().includes("gold")
                      ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                      : tierName.toLowerCase().includes("silver")
                      ? "bg-slate-400/15 text-slate-300 border-slate-400/30"
                      : "bg-primary/15 text-primary border-primary/30"
                  }`}>
                    <Medal className="w-3 h-3" />
                    {tierName} Member
                  </div>
                )}
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-surface-container-low rounded-xl p-3 flex flex-col items-center">
                  <span className="text-[9px] text-primary font-bold uppercase tracking-widest mb-0.5">Matches</span>
                  <span className="text-lg font-display font-black">{profile.total_matches}</span>
                </div>
                <div className="bg-surface-container-low rounded-xl p-3 flex flex-col items-center">
                  <span className="text-[9px] text-primary font-bold uppercase tracking-widest mb-0.5">Win Rate</span>
                  <span className="text-lg font-display font-black text-primary">{winRate}</span>
                </div>
                <div className="bg-surface-container-low rounded-xl p-3 flex flex-col items-center">
                  <span className="text-[9px] text-primary font-bold uppercase tracking-widest mb-0.5">Reliability</span>
                  <span className="text-base font-display font-black">{reliabilityLabel}</span>
                </div>
              </div>

              {/* Message Button */}
              {allowDirectMessage && user && user.id !== playerId && (
                <Button
                  variant="outline"
                  className="w-full h-11 rounded-xl font-semibold gap-2"
                  disabled={startingChat}
                  onClick={async () => {
                    if (!playerId) return;
                    setStartingChat(true);
                    const convId = await getOrCreateDirectChat(playerId, true);
                    setStartingChat(false);
                    if (convId) {
                      onOpenChange(false);
                      navigate(`/messages/${convId}`);
                    }
                  }}
                >
                  <MessageSquare className="w-4 h-4" />
                  {startingChat ? "Opening..." : "Message"}
                </Button>
              )}

              {/* Tactical Assets */}
              {(profile.dominant_hand || profile.preferred_side) && (
                <div className="flex gap-2 flex-wrap">
                  {profile.dominant_hand && (
                    <div className="flex items-center gap-1.5 bg-surface-container-low border border-primary/30 px-3 py-1.5 rounded-full">
                      <Bolt className="w-3.5 h-3.5 text-primary" />
                      <span className="text-[11px] font-bold uppercase tracking-wider capitalize">{profile.dominant_hand}</span>
                    </div>
                  )}
                  {profile.preferred_side && (
                    <div className="flex items-center gap-1.5 bg-surface-container-low border border-primary/30 px-3 py-1.5 rounded-full">
                      <Crosshair className="w-3.5 h-3.5 text-primary" />
                      <span className="text-[11px] font-bold uppercase tracking-wider capitalize">{profile.preferred_side}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 bg-surface-container-low border border-primary/30 px-3 py-1.5 rounded-full">
                    <Gauge className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[11px] font-bold uppercase tracking-wider">Cat {levelToCategory(profile.padel_level)}</span>
                  </div>
                </div>
              )}

              {/* Head-to-Head */}
              {user && user.id !== playerId && (
                <div className="bg-surface-container-high rounded-xl p-4 space-y-3">
                  <h3 className="text-xs font-display font-black text-muted-foreground uppercase tracking-[0.2em]">
                    Head to Head
                  </h3>
                  {h2h.total > 0 ? (
                    <>
                      <p className="text-sm text-muted-foreground">
                        {h2h.total} match{h2h.total !== 1 ? "es" : ""} played against each other
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="flex flex-col items-center bg-primary/10 rounded-lg py-2">
                          <Trophy className="w-4 h-4 text-primary mb-1" />
                          <span className="text-lg font-display font-black text-primary">{h2h.wins}</span>
                          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Wins</span>
                        </div>
                        <div className="flex flex-col items-center bg-muted/50 rounded-lg py-2">
                          <Minus className="w-4 h-4 text-muted-foreground mb-1" />
                          <span className="text-lg font-display font-black">{h2h.draws}</span>
                          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Draws</span>
                        </div>
                        <div className="flex flex-col items-center bg-destructive/10 rounded-lg py-2">
                          <Swords className="w-4 h-4 text-destructive mb-1" />
                          <span className="text-lg font-display font-black text-destructive">{h2h.losses}</span>
                          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Losses</span>
                        </div>
                      </div>

                      {/* Match History */}
                      <div className="space-y-2 pt-2">
                        <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Match History</h4>
                        {h2hMatches.map((m) => (
                          <div
                            key={m.match_id}
                            className="flex items-center gap-3 bg-background/60 rounded-lg px-3 py-2.5"
                          >
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded italic shrink-0 ${
                              m.result === "win"
                                ? "bg-primary/20 text-primary"
                                : m.result === "loss"
                                ? "bg-destructive/20 text-destructive"
                                : "bg-muted text-muted-foreground"
                            }`}>
                              {m.result === "win" ? "WIN" : m.result === "loss" ? "LOSS" : "DRAW"}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold truncate">{m.score}</p>
                              <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                                <Calendar className="w-3 h-3 inline" />
                                {(() => {
                                  try { return format(new Date(m.date + "T00:00:00"), "d MMM yyyy"); } catch { return m.date; }
                                })()}
                                {" · "}
                                {m.club}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No matches played against each other yet</p>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        ) : (
          <div className="py-16 text-center text-muted-foreground text-sm">Player not found</div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PlayerProfileModal;
