/**
 * PostMatchStats.tsx
 *
 * Full-screen animated post-match stats page.
 * Replicates the Editor Pro Max Remotion animation as real CSS animations.
 *
 * Route: /matches/:id/stats
 * Receives data via location.state or falls back to demo data.
 *
 * Animation timeline:
 *   0.0s  BG + VICTORY/DEFEAT slams down
 *   0.8s  Score counts up
 *   1.4s  Stat cards stagger in from left
 *   2.4s  XP bar fills
 *   3.2s  MVP badge bounces in (if MVP)
 *   3.8s  CTA button pulses in
 */

import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Trophy } from "lucide-react";
import xplayLogoFull from "@/assets/xplay-logo-full.png";

// ─── Types ────────────────────────────────────────────────────────────────
export interface PostMatchData {
  result: "win" | "loss";
  scoreA: number;
  scoreB: number;
  rating: number;
  goals: number;
  assists: number;
  shots: number;
  playerName: string;
  xpEarned: number;
  isMVP: boolean;
  level?: number;
  currentXP?: number;
  maxXP?: number;
}

const DEMO_WIN: PostMatchData = {
  result: "win", scoreA: 3, scoreB: 1, rating: 8.5,
  goals: 2, assists: 1, shots: 6,
  playerName: "Nacho R.", xpEarned: 450, isMVP: true,
  level: 12, currentXP: 2450, maxXP: 3000,
};

const DEMO_LOSS: PostMatchData = {
  result: "loss", scoreA: 1, scoreB: 3, rating: 6.2,
  goals: 0, assists: 1, shots: 4,
  playerName: "Nacho R.", xpEarned: 120, isMVP: false,
  level: 12, currentXP: 2120, maxXP: 3000,
};

// ─── Brand tokens ─────────────────────────────────────────────────────────
const C = {
  bg:     "#1A2833",
  purple: "#5924C6",
  lime:   "#CDFF65",
  orange: "#FFBF00",
  blue:   "#ADBFF0",
  loss:   "#FF4D4D",
  card:   "#0F1D27",
};

// ─── Counter hook ─────────────────────────────────────────────────────────
function useCountUp(target: number, startMs: number, durationMs: number, decimals = 0): string {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min((now - start) / durationMs, 1);
        // ease-out cubic
        const eased = 1 - Math.pow(1 - t, 3);
        setVal(target * eased);
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, startMs);
    return () => clearTimeout(timer);
  }, [target, startMs, durationMs]);
  return decimals > 0 ? val.toFixed(decimals) : Math.round(val).toString();
}

// ─── Stat card ────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string;
  accent?: string;
  delay: number;
  visible: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, accent = C.lime, delay, visible }) => (
  <div
    style={{
      flex: 1,
      background: `linear-gradient(145deg, ${C.card}, #0a1520)`,
      border: `1.5px solid ${accent}30`,
      borderRadius: 20,
      padding: "24px 16px 20px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 8,
      boxShadow: `0 6px 28px rgba(0,0,0,0.5)`,
      transform: visible ? "translateX(0)" : "translateX(-60px)",
      opacity: visible ? 1 : 0,
      transition: `transform 0.5s cubic-bezier(0.2,0.9,0.3,1) ${delay}ms, opacity 0.4s ease-out ${delay}ms`,
    }}
  >
    <span style={{
      fontFamily: "'Lexend', sans-serif", fontWeight: 800,
      fontSize: "clamp(28px, 8vw, 44px)",
      color: accent, lineHeight: 1,
    }}>{value}</span>
    <span style={{
      fontFamily: "'Manrope', sans-serif", fontWeight: 700,
      fontSize: "clamp(10px, 2.8vw, 14px)",
      color: C.blue, textTransform: "uppercase", letterSpacing: "0.2em",
    }}>{label}</span>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────
export default function PostMatchStats() {
  const location = useLocation();
  const navigate = useNavigate();
  const { id: matchId } = useParams<{ id: string }>();

  // Accept data from navigation state, or fall back to demo
  const data: PostMatchData = (location.state as PostMatchData) ?? DEMO_WIN;
  const isWin = data.result === "win";
  const rc = isWin ? C.lime : C.loss;

  // ─── Animation phases ─────────────────────────────────────────
  const [showResult,  setShowResult]  = useState(false);
  const [showScore,   setShowScore]   = useState(false);
  const [showCards,   setShowCards]   = useState(false);
  const [showXP,      setShowXP]      = useState(false);
  const [showMVP,     setShowMVP]     = useState(false);
  const [showCTA,     setShowCTA]     = useState(false);

  useEffect(() => {
    const t0 = setTimeout(() => setShowResult(true),  80);
    const t1 = setTimeout(() => setShowScore(true),   800);
    const t2 = setTimeout(() => setShowCards(true),   1400);
    const t3 = setTimeout(() => setShowXP(true),      2400);
    const t4 = setTimeout(() => setShowMVP(true),     3200);
    const t5 = setTimeout(() => setShowCTA(true),     3800);
    return () => [t0,t1,t2,t3,t4,t5].forEach(clearTimeout);
  }, []);

  // ─── Counters ────────────────────────────────────────────────
  const scAStr  = useCountUp(data.scoreA,  800, 900);
  const scBStr  = useCountUp(data.scoreB,  900, 900);
  const ratingStr = useCountUp(data.rating, 1450, 700, 1);
  const goalsStr  = useCountUp(data.goals,  1600, 600);
  const assistStr = useCountUp(data.assists,1750, 600);
  const shotsStr  = useCountUp(data.shots,  1900, 600);
  const xpStr     = useCountUp(data.xpEarned, 2500, 800);
  const xpFillStr = useCountUp(100, 2500, 900);

  // ─── Glowing result text pulse ───────────────────────────────
  const [glowSize, setGlowSize] = useState(28);
  useEffect(() => {
    const interval = setInterval(() => {
      setGlowSize(g => g === 28 ? 42 : 28);
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  const level = data.level ?? 12;
  const currentXP = data.currentXP ?? 2450;
  const maxXP = data.maxXP ?? 3000;

  return (
    <div
      style={{
        minHeight: "100dvh",
        backgroundColor: C.bg,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
        fontFamily: "'Manrope', sans-serif",
      }}
    >
      {/* BG grid */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `
          linear-gradient(rgba(205,255,101,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(205,255,101,0.04) 1px, transparent 1px)
        `,
        backgroundSize: "72px 72px", opacity: 0.5,
      }} />

      {/* BG radial result glow */}
      <div style={{
        position: "absolute", top: "-20%", left: "50%", transform: "translateX(-50%)",
        width: "100vmax", height: "100vmax", borderRadius: "50%",
        background: isWin
          ? `radial-gradient(circle, rgba(205,255,101,0.12) 0%, transparent 55%)`
          : `radial-gradient(circle, rgba(255,77,77,0.10) 0%, transparent 55%)`,
        transition: "opacity 1s",
        opacity: showResult ? 1 : 0,
      }} />

      {/* BG purple bottom */}
      <div style={{
        position: "absolute", bottom: "-15%", left: "50%", transform: "translateX(-50%)",
        width: "80vmax", height: "60vmax", borderRadius: "50%",
        background: `radial-gradient(circle, rgba(89,36,198,0.18) 0%, transparent 65%)`,
      }} />

      {/* Content */}
      <div style={{
        position: "relative", zIndex: 1,
        display: "flex", flexDirection: "column",
        alignItems: "center",
        padding: "env(safe-area-inset-top, 20px) 20px env(safe-area-inset-bottom, 20px)",
        gap: 0, flex: 1,
      }}>

        {/* ── RESULT HEADER ── */}
        <div
          style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            gap: 10, paddingTop: 24, paddingBottom: 8,
            transform: showResult ? "translateY(0)" : "translateY(-100px)",
            opacity: showResult ? 1 : 0,
            transition: "transform 0.6s cubic-bezier(0.1,1.3,0.3,1), opacity 0.3s ease-out",
          }}
        >
          {/* Mini logo */}
          <div style={{ borderRadius: 10, overflow: "hidden", marginBottom: 4 }}>
            <img src={xplayLogoFull} alt="XPLAY" style={{ display: "block", width: 88 }} />
          </div>

          {/* Player name */}
          <span style={{
            fontSize: 18, fontWeight: 700, color: C.blue,
            letterSpacing: "0.2em", textTransform: "uppercase",
          }}>
            {data.playerName}
          </span>

          {/* VICTORY / DEFEAT badge */}
          <div style={{
            padding: "10px 36px", borderRadius: 16,
            background: `${rc}14`,
            border: `2.5px solid ${rc}`,
            boxShadow: `0 0 ${glowSize}px ${glowSize * 0.4}px ${rc}45`,
            transition: "box-shadow 1.2s ease-in-out",
          }}>
            <span style={{
              fontFamily: "'Lexend', sans-serif",
              fontWeight: 900,
              fontSize: "clamp(36px, 11vw, 64px)",
              color: rc,
              letterSpacing: "0.15em",
              lineHeight: 1,
            }}>
              {isWin ? "VICTORY" : "DEFEAT"}
            </span>
          </div>
        </div>

        {/* ── SCORE ── */}
        <div
          style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            padding: "12px 0 8px",
            transform: showScore ? "scale(1)" : "scale(0.65)",
            opacity: showScore ? 1 : 0,
            transition: "transform 0.5s cubic-bezier(0.2,0.9,0.3,1), opacity 0.4s ease-out",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{
              fontFamily: "'Lexend', sans-serif", fontWeight: 900,
              fontSize: "clamp(64px, 18vw, 100px)",
              color: isWin ? C.lime : "#fff", lineHeight: 1,
            }}>{scAStr}</span>
            <span style={{
              fontFamily: "'Lexend', sans-serif", fontWeight: 300,
              fontSize: "clamp(40px, 11vw, 64px)",
              color: `${C.blue}70`, lineHeight: 1,
            }}>–</span>
            <span style={{
              fontFamily: "'Lexend', sans-serif", fontWeight: 900,
              fontSize: "clamp(64px, 18vw, 100px)",
              color: isWin ? `${C.blue}80` : C.loss, lineHeight: 1,
            }}>{scBStr}</span>
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.blue, letterSpacing: "0.22em", textTransform: "uppercase" }}>
            FINAL SCORE
          </span>
          <div style={{ width: 200, height: 1, background: `linear-gradient(90deg, transparent, ${C.lime}50, transparent)`, marginTop: 8 }} />
        </div>

        {/* ── STAT CARDS ── */}
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10, padding: "8px 0" }}>
          <div style={{ display: "flex", gap: 10 }}>
            <StatCard label="Rating"  value={ratingStr} accent={C.orange} delay={0}   visible={showCards} />
            <StatCard label="Goals"   value={goalsStr}  accent={C.lime}   delay={100} visible={showCards} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <StatCard label="Assists" value={assistStr} accent={C.lime}   delay={200} visible={showCards} />
            <StatCard label="Shots"   value={shotsStr}  accent={C.blue}   delay={300} visible={showCards} />
          </div>
        </div>

        {/* ── XP BAR ── */}
        <div
          style={{
            width: "100%", padding: "12px 0",
            opacity: showXP ? 1 : 0,
            transform: showXP ? "translateY(0)" : "translateY(20px)",
            transition: "opacity 0.5s ease-out, transform 0.5s cubic-bezier(0.2,0.9,0.3,1)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.blue, letterSpacing: "0.15em", textTransform: "uppercase" }}>XP Earned</span>
            <span style={{
              fontFamily: "'Lexend', sans-serif", fontWeight: 800,
              fontSize: "clamp(22px, 6vw, 32px)",
              color: C.orange, letterSpacing: "-0.02em",
            }}>+{xpStr}</span>
          </div>
          <div style={{ height: 10, background: "rgba(255,255,255,0.06)", borderRadius: 5, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${xpFillStr}%`,
              background: `linear-gradient(90deg, ${C.purple}, ${C.orange})`,
              borderRadius: 5,
              boxShadow: `0 0 12px 3px ${C.orange}60`,
              transition: "width 0.9s cubic-bezier(0.2,0.9,0.3,1)",
            }} />
          </div>
          <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: `${C.blue}88`, fontWeight: 500 }}>Level {level}</span>
            <span style={{ fontSize: 13, color: `${C.blue}88`, fontWeight: 500 }}>
              {currentXP.toLocaleString()} / {maxXP.toLocaleString()} XP
            </span>
          </div>
        </div>

        {/* ── MVP BADGE ── */}
        {data.isMVP && (
          <div
            style={{
              display: "flex", justifyContent: "center", padding: "4px 0 8px",
              transform: showMVP ? "translateY(0) scale(1)" : "translateY(-40px) scale(0.8)",
              opacity: showMVP ? 1 : 0,
              transition: "transform 0.55s cubic-bezier(0.1,1.4,0.3,1), opacity 0.35s ease-out",
            }}
          >
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              background: `linear-gradient(135deg, rgba(255,191,0,0.12), rgba(255,191,0,0.05))`,
              border: `2px solid rgba(255,191,0,0.5)`,
              borderRadius: 50, padding: "12px 28px",
              boxShadow: `0 0 24px 6px rgba(255,191,0,0.25)`,
            }}>
              <Trophy size={22} color={C.orange} />
              <span style={{
                fontFamily: "'Lexend', sans-serif", fontWeight: 800,
                fontSize: "clamp(15px, 4.5vw, 22px)",
                color: C.orange, letterSpacing: "0.12em", textTransform: "uppercase",
              }}>
                MVP of the Match
              </span>
            </div>
          </div>
        )}

        {/* ── CTA ── */}
        <div
          style={{
            width: "100%", padding: "8px 0 16px",
            opacity: showCTA ? 1 : 0,
            transform: showCTA ? "scale(1)" : "scale(0.9)",
            transition: "opacity 0.4s ease-out, transform 0.4s cubic-bezier(0.2,0.9,0.3,1)",
          }}
        >
          <button
            onClick={() => navigate(matchId ? `/matches/${matchId}` : "/matches")}
            style={{
              width: "100%",
              padding: "18px 0",
              background: `linear-gradient(90deg, ${C.purple}, ${C.lime})`,
              border: "none", borderRadius: 16, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              boxShadow: `0 6px 28px ${C.purple}50`,
              animation: showCTA ? "ctaPulse 2s ease-in-out infinite 0.5s" : "none",
            }}
          >
            <span style={{
              fontFamily: "'Lexend', sans-serif", fontWeight: 800,
              fontSize: "clamp(16px, 4.5vw, 22px)",
              color: C.bg, letterSpacing: "0.04em",
            }}>
              See Full Stats
            </span>
            <ArrowRight size={20} color={C.bg} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Bottom glow line */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent, ${C.lime}, ${C.orange}, transparent)`,
        opacity: showLogo(showResult) ? 1 : 0,
        transition: "opacity 0.5s ease-out 0.6s",
      }} />

      {/* CSS keyframes injected */}
      <style>{`
        @keyframes ctaPulse {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.025); }
        }
      `}</style>
    </div>
  );
}

// small helper to avoid unused-var lint
function showLogo(v: boolean) { return v; }
