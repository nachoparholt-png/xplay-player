/**
 * Profile — rebranded per design handoff flow4-profile.jsx (PR1/PR2/PR4).
 * ────────────────────────────────────────────────────────────────────────
 * PR1: player-card hero (identity + level/win-rate/form), prominent XP block,
 *      recent matches, rails, warn-styled sign out.
 * PR2: shareable player card bottom sheet (native share w/ clipboard fallback).
 * PR4: new-player empty state (no sad charts; missions + find-a-match push).
 * Note: the app-wide top bar (AppLayout) already shows the XPLAY logo +
 * points chip, so the mockup's logo strip is not duplicated here.
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Settings, LogOut, Share2, Zap, BarChart3, CreditCard, Bell, Check, X, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import xplayLogo from "@/assets/xplay-logo-full.png";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type RecentMatch = {
  id: string;
  opponent: string;
  result: "win" | "loss";
  ratingChange: string;
  newRating: string;
  date: string;
  venue: string;
};

const FormDots = ({ results, size = 22 }: { results: ("W" | "L")[]; size?: number }) => (
  <div className="flex gap-1.5">
    {results.length === 0 ? (
      <span className="font-mono text-lg text-muted-foreground">—</span>
    ) : (
      results.map((r, i) => (
        <div
          key={i}
          style={{ width: size, height: size }}
          className={`rounded-md flex items-center justify-center font-mono font-bold text-[11px] ${
            r === "W" ? "bg-primary text-primary-foreground" : "bg-[#FF6B35]/20 text-[#FF6B35]"
          }`}
        >
          {r}
        </div>
      ))
    )}
  </div>
);

const Profile = () => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [recentMatches, setRecentMatches] = useState<RecentMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    const fetchRecentMatches = async () => {
      setMatchesLoading(true);
      try {
        const { data: history, error: historyError } = await supabase
          .from("rating_history")
          .select(`
            id,
            match_id,
            level_change,
            actual_result,
            new_level,
            created_at,
            matches (
              match_date,
              club,
              court,
              match_players (
                user_id,
                team,
                profiles (
                  display_name
                )
              )
            )
          `)
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(5);

        if (historyError || !history?.length) {
          setMatchesLoading(false);
          return;
        }

        type MatchPlayerRow = {
          user_id: string;
          team: string | null;
          profiles: { display_name: string | null } | null;
        };
        type MatchRow = {
          match_date?: string | null;
          club?: string | null;
          court?: string | null;
          match_players?: MatchPlayerRow[];
        };

        const built: RecentMatch[] = history.map((h) => {
          // double-cast: generated types miss the match_players→profiles relation
          const match = h.matches as unknown as MatchRow | null;
          const matchPlayers = match?.match_players || [];

          const myPlayer = matchPlayers.find((p) => p.user_id === user.id);
          const myTeam = myPlayer?.team;

          const opponents = matchPlayers
            .filter((p) => p.user_id !== user.id && myTeam && p.team !== myTeam)
            .map((p) => {
              const name = p.profiles?.display_name || "Unknown";
              const parts = name.trim().split(" ");
              if (parts.length >= 2) {
                return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
              }
              return name;
            });

          const opponentText =
            opponents.length > 0 ? opponents.join(" & ") : "Unknown opponents";

          const isWin = Number(h.actual_result) === 1;
          const change = Number(h.level_change ?? 0);
          const dateStr = match?.match_date
            ? new Date(match.match_date).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
              })
            : new Date(h.created_at).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
              });

          return {
            id: h.id,
            opponent: opponentText,
            result: isWin ? "win" : "loss",
            ratingChange: `${change >= 0 ? "+" : ""}${change.toFixed(2)}`,
            newRating: Number(h.new_level ?? 0).toFixed(1),
            date: dateStr,
            venue: match?.club || match?.court || "Unknown venue",
          };
        });

        setRecentMatches(built);
      } catch (e) {
        console.error("[Profile] Error fetching recent matches:", e);
      } finally {
        setMatchesLoading(false);
      }
    };

    fetchRecentMatches();
  }, [user]);

  const totalMatches = profile?.total_matches ?? 0;
  const wins = profile?.wins ?? 0;
  const winRate = totalMatches > 0 ? `${Math.round((wins / totalMatches) * 100)}%` : "—";
  const level = profile?.padel_level ? profile.padel_level.toFixed(1) : "—";
  const points = profile?.padel_park_points ?? 0;
  const lifetimeEarned = profile?.lifetime_earned ?? points;
  const memberNo = user ? `#${user.id.replace(/-/g, "").slice(0, 4).toUpperCase()}` : "#----";
  const isNewPlayer = totalMatches === 0;

  const formResults: ("W" | "L")[] = recentMatches
    .slice(0, 5)
    .map((m) => (m.result === "win" ? "W" : "L"))
    .reverse();
  let streak = 0;
  for (let i = recentMatches.length - 1 >= 0 ? 0 : 0; i < recentMatches.length; i++) {
    if (recentMatches[i].result === "win") streak++;
    else break;
  }

  const handleNativeShare = async () => {
    const text = `My XPLAY player card — Level ${level}, ${winRate} win rate${streak > 1 ? `, ${streak}W streak` : ""}. Find me on court ⚡`;
    const url = "https://xplay-player.vercel.app";
    // 1) native share sheet via Capacitor plugin
    try {
      const cap = await import("@capacitor/share");
      await cap.Share.share({ title: "My XPLAY player card", text, url });
      return;
    } catch (e) {
      if (e instanceof Error && /cancel/i.test(e.message)) return;
    }
    // 2) Web Share API
    try {
      if (navigator.share) {
        await navigator.share({ title: "My XPLAY player card", text, url });
        return;
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
    }
    // 3) guaranteed fallback
    await navigator.clipboard.writeText(`${text} ${url}`);
    toast({ title: "Copied to clipboard", description: "Paste it anywhere to share." });
  };

  // PR4 adjusted per Ignacio (12 Jun): stats stay VISIBLE for new players
  // (zeroed strip in the hero) — only the lower sections swap to missions/push.
  const missions = [
    { label: "Complete your profile", xp: "+20", done: !!profile?.onboarding_completed },
    { label: "Join your first match", xp: "+30", done: totalMatches > 0 },
    { label: "Invite a friend", xp: "+25", done: false },
  ];

  /* ── PR1 · player-card profile home ─────────────────────────── */
  return (
    <div className="px-4 py-5 space-y-4">
      {/* PLAYER CARD hero */}
      <motion.section
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[22px] p-5 relative overflow-hidden bg-gradient-to-br from-surface-container to-background border border-primary/20"
      >
        {/* ghost level */}
        <div className="absolute -right-8 -top-10 opacity-[0.06] pointer-events-none select-none">
          <span className="font-display font-black italic text-primary leading-[0.8]" style={{ fontSize: 200 }}>
            {level}
          </span>
        </div>

        <div className="flex gap-3.5 items-center relative">
          <div className="w-16 h-16 rounded-full p-0.5 bg-gradient-to-br from-primary to-[#5924C6] flex-shrink-0">
            <Avatar className="w-full h-full">
              <AvatarImage src={profile?.avatar_url || ""} className="object-cover" />
              <AvatarFallback className="font-display text-2xl font-black italic bg-surface-container text-primary">
                {profile?.display_name?.[0]?.toUpperCase() || "P"}
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="flex-1 min-w-0 pr-16">
            <h2 className="font-display text-[24px] font-black italic uppercase leading-none truncate">
              {profile?.display_name || "Player"}
            </h2>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {[profile?.location, profile?.preferred_club].filter(Boolean).join(" · ") || "—"}
            </p>
            <span className="inline-flex items-center gap-1.5 mt-1.5 bg-primary/10 rounded-full px-2.5 py-0.5">
              <Zap className="w-3 h-3 text-primary fill-primary" />
              <span className="font-mono text-[11px] font-bold text-primary">Member {memberNo}</span>
            </span>
          </div>
        </div>

        {/* share pill */}
        <button
          onClick={() => setShareOpen(true)}
          className="absolute top-4 right-4 flex items-center gap-1.5 bg-primary/15 rounded-full px-3 py-1.5 active:scale-95 transition-transform"
        >
          <Share2 className="w-3.5 h-3.5 text-primary" />
          <span className="font-display text-[10px] font-extrabold uppercase tracking-wide text-primary">Share</span>
        </button>

        {/* stat strip */}
        <div className="flex mt-4 pt-4 border-t border-border/40 relative">
          <div className="flex-1">
            <div className="text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">Level</div>
            <div className="font-mono text-[26px] font-bold text-primary leading-tight">{level}</div>
          </div>
          <div className="flex-1 border-l border-border/40 pl-3.5">
            <div className="text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">Win rate</div>
            <div className="font-mono text-[26px] font-bold leading-tight">{winRate}</div>
          </div>
          <div className="flex-1 border-l border-border/40 pl-3.5">
            <div className="text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">Form</div>
            <div className="mt-1.5"><FormDots results={formResults} /></div>
          </div>
        </div>

        <button
          onClick={() => navigate("/profile/settings")}
          className="absolute bottom-4 right-4 p-1.5 text-muted-foreground active:scale-95"
          aria-label="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </motion.section>

      {/* XP POINTS presence */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-[18px] px-4.5 p-4 flex items-center justify-between bg-gradient-to-br from-[#FFBF00] to-[#E6A500] text-[#1A2833]"
      >
        <div>
          <div className="font-display text-[10px] font-extrabold uppercase tracking-[0.16em] opacity-70">
            XPLAY Points
          </div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="font-mono text-3xl font-bold leading-none">{points.toLocaleString()}</span>
            <span className="font-display text-base font-black italic">XP</span>
          </div>
          <div className="text-[11.5px] font-bold mt-1 opacity-70">
            worth £{(points / 100).toFixed(2)} · {lifetimeEarned.toLocaleString()} earned all-time
          </div>
        </div>
        <button
          onClick={() => navigate("/rewards")}
          className="bg-[#1A2833] text-primary rounded-xl px-4 py-3 font-display text-xs font-extrabold uppercase tracking-wide active:scale-95 transition-transform"
        >
          Rewards →
        </button>
      </motion.section>

      {/* New player: first-match push + missions (stats above stay visible, zeroed) */}
      {isNewPlayer && (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="space-y-3">
          <div className="rounded-[20px] p-5 text-center bg-gradient-to-br from-primary to-[#A8D648] text-primary-foreground">
            <h3 className="font-display text-xl font-black italic uppercase leading-[0.95]">
              Play your first match to begin
            </h3>
            <p className="text-xs font-semibold mt-1.5 opacity-75">
              Your win rate, form and history fill in the moment you step on court.
            </p>
            <button
              onClick={() => navigate("/matches")}
              className="mt-3.5 w-full bg-[#1A2833] text-primary rounded-xl py-3 font-display font-extrabold text-sm uppercase tracking-wide active:scale-[0.98] transition-transform"
            >
              Find a match →
            </button>
          </div>
          <div className="px-1">
            <span className="text-[11px] font-black tracking-[0.14em] uppercase text-muted-foreground">
              First-week missions · +75 XP bonus
            </span>
          </div>
          {missions.map((m) => (
            <div
              key={m.label}
              className={`flex items-center gap-3 rounded-[14px] px-3.5 py-3 border ${
                m.done ? "bg-green-500/10 border-green-500/30" : "bg-card border-border/40"
              }`}
            >
              <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center ${m.done ? "bg-green-500" : "bg-muted border-2 border-border"}`}>
                {m.done && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
              </div>
              <span className={`flex-1 text-[13px] font-bold ${m.done ? "text-foreground/50 line-through" : "text-foreground"}`}>{m.label}</span>
              <span className="font-mono text-xs font-bold text-primary">{m.xp} XP</span>
            </div>
          ))}
        </motion.section>
      )}

      {/* Recent matches */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="space-y-2"
      >
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-black tracking-[0.14em] uppercase text-muted-foreground">
            Recent matches
          </span>
          <button
            onClick={() => navigate("/matches")}
            className="text-[11px] font-bold text-primary"
          >
            See all
          </button>
        </div>
        {matchesLoading ? (
          [0, 1, 2].map((i) => (
            <div key={i} className="h-[58px] rounded-xl bg-muted/40 animate-pulse" />
          ))
        ) : recentMatches.length === 0 ? (
          <div className="bg-card rounded-xl p-5 text-center border border-border/40">
            <p className="text-sm text-muted-foreground font-medium">No rated matches yet</p>
          </div>
        ) : (
          recentMatches.map((m) => (
            <div key={m.id} className="flex items-center gap-3 bg-card border border-border/40 rounded-xl px-3.5 py-3">
              <div
                className={`w-7 h-7 rounded-md flex-shrink-0 flex items-center justify-center font-mono font-bold text-xs ${
                  m.result === "win" ? "bg-primary text-primary-foreground" : "bg-[#FF6B35]/20 text-[#FF6B35]"
                }`}
              >
                {m.result === "win" ? "W" : "L"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-mono text-[13px] font-bold truncate">vs {m.opponent}</div>
                <div className="text-[11px] text-muted-foreground truncate">{m.venue} · {m.date}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className={`font-mono text-xs font-bold ${m.result === "win" ? "text-primary" : "text-[#FF6B35]"}`}>
                  {m.ratingChange}
                </div>
                <div className="text-[9px] text-muted-foreground font-bold uppercase">rating</div>
              </div>
            </div>
          ))
        )}
      </motion.section>

      {/* Rails */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="space-y-2"
      >
        {[
          {
            icon: <BarChart3 className="w-[18px] h-[18px] text-primary" />,
            title: "Rating & history",
            sub: `${totalMatches} matches · ${wins} W · ${totalMatches - wins} L`,
            to: "/matches",
          },
          {
            icon: <CreditCard className="w-[18px] h-[18px] text-primary" />,
            title: "Payments & subscriptions",
            sub: "Bookings, orders & receipts",
            to: "/bookings",
          },
          {
            icon: <Bell className="w-[18px] h-[18px] text-primary" />,
            title: "Notifications & privacy",
            sub: "Match alerts · profile visibility",
            to: "/profile/settings",
          },
        ].map((r) => (
          <button
            key={r.title}
            onClick={() => navigate(r.to)}
            className="w-full flex items-center gap-3 px-4 py-3.5 bg-card border border-border/40 rounded-[14px] active:scale-[0.98] transition-transform text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              {r.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold">{r.title}</div>
              <div className="text-[11.5px] text-muted-foreground truncate">{r.sub}</div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
          </button>
        ))}
      </motion.section>

      {/* Sign out */}
      <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="pt-1 pb-3">
        <button
          onClick={signOut}
          className="w-full py-3.5 rounded-xl border border-[#FF6B35]/25 text-[#FF6B35] font-display font-extrabold text-xs uppercase tracking-[0.06em] active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </motion.section>

      {/* ── PR2 · shareable player card sheet ──────────────────── */}
      <AnimatePresence>
        {shareOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShareOpen(false)}
              className="fixed inset-0 bg-black/70 z-50"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="fixed left-0 right-0 bottom-0 top-20 z-50 bg-background rounded-t-[28px] border-t border-border/40 p-5 pb-7 flex flex-col"
            >
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto mb-4" />
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-xl font-black italic uppercase">Your player card</h3>
                <button onClick={() => setShareOpen(false)} className="p-1.5 text-muted-foreground" aria-label="Close">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* THE CARD */}
              <div className="flex-1 rounded-[22px] relative overflow-hidden border border-primary/25 p-5 bg-gradient-to-br from-[#5924C6] via-[#0D1820] to-[#1A2833]">
                <div className="absolute -right-8 -bottom-14 opacity-10 pointer-events-none select-none">
                  <span className="font-display font-black italic text-primary leading-[0.7]" style={{ fontSize: 260 }}>
                    {level}
                  </span>
                </div>
                <div className="flex justify-between items-start relative">
                  <img src={xplayLogo} alt="XPLAY" className="h-7 w-auto object-contain" />
                  <span className="font-mono text-[10px] text-white/50">{memberNo}</span>
                </div>
                <div className="mt-6 relative">
                  <div className="w-14 h-14 rounded-full p-0.5 bg-gradient-to-br from-primary to-[#5924C6]">
                    <Avatar className="w-full h-full">
                      <AvatarImage src={profile?.avatar_url || ""} className="object-cover" />
                      <AvatarFallback className="font-display text-xl font-black italic bg-[#1A2833] text-primary">
                        {profile?.display_name?.[0]?.toUpperCase() || "P"}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="font-display text-[32px] font-black italic uppercase text-white leading-[0.95] mt-3.5">
                    {profile?.display_name || "Player"}
                  </div>
                  <div className="text-xs text-white/60 mt-1.5">
                    {[profile?.location, profile?.preferred_club].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="absolute left-5 right-5 bottom-5">
                  <div className="flex gap-2.5">
                    {[
                      { l: "Level", v: level, c: "text-primary" },
                      { l: "Win rate", v: winRate, c: "text-white" },
                      { l: "Streak", v: streak > 0 ? `${streak}W` : "—", c: "text-amber-400" },
                    ].map((s) => (
                      <div key={s.l} className="flex-1 bg-white/[0.06] border border-white/10 rounded-[14px] px-3 py-2.5">
                        <div className="text-[9px] font-extrabold uppercase tracking-wider text-white/50">{s.l}</div>
                        <div className={`font-mono text-2xl font-bold leading-tight ${s.c}`}>{s.v}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <FormDots results={formResults} size={20} />
                    <span className="text-[11px] text-white/50">last 5 · play on XPLAY</span>
                  </div>
                </div>
              </div>

              {/* actions */}
              <div className="flex gap-2.5 mt-4">
                <button
                  onClick={handleNativeShare}
                  className="flex-1 bg-primary text-primary-foreground rounded-[13px] py-3.5 font-display font-black italic text-sm uppercase tracking-wide active:scale-[0.98] transition-transform"
                >
                  Share
                </button>
                <button
                  onClick={handleNativeShare}
                  className="w-[52px] rounded-[13px] bg-muted flex items-center justify-center active:scale-95 transition-transform"
                  aria-label="More share options"
                >
                  <Download className="w-5 h-5 text-foreground" />
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Profile;
