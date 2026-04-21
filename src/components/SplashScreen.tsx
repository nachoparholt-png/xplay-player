/**
 * SplashScreen.tsx
 *
 * Full-screen animated intro that plays once when the app loads.
 * Replicates the reference Instagram video animation style.
 *
 * Timeline (~3s total):
 *  0.00 – 0.40s  Dark bg + grid fades in
 *  0.40 – 1.00s  Teaser text slides up ("YOUR GAME. YOUR CLUB.")
 *  0.60 – 1.20s  Subtitle fades in
 *  1.10 – 1.40s  Both fade out
 *  1.35 – 1.90s  Logo slams in from top (spring)
 *  1.85 – 2.60s  Tagline types in character-by-character
 *  2.60 – 3.20s  Hold + whole screen fades out
 */

import { useEffect, useState, useRef } from "react";
import xplayLogoFull from "@/assets/xplay-logo-full.png";

interface SplashScreenProps {
  onComplete: () => void;
}

const TAGLINE = "PLAY. EARN. COMPETE.";
const TOTAL_MS = 3200;

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [phase, setPhase] = useState<
    "dark" | "teaser" | "fadeout" | "logo" | "tagline" | "hold" | "exit"
  >("dark");
  const [tagChars, setTagChars] = useState(0);
  const [cursorOn, setCursorOn] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Phase scheduler ───────────────────────────────────────────
  useEffect(() => {
    const schedule = (fn: () => void, ms: number) => {
      timerRef.current = setTimeout(fn, ms);
    };

    // 0 → dark bg
    schedule(() => setPhase("teaser"),  400);
    schedule(() => setPhase("fadeout"), 1150);
    schedule(() => setPhase("logo"),    1350);
    schedule(() => setPhase("tagline"), 1900);
    schedule(() => setPhase("hold"),    2650);
    schedule(() => setPhase("exit"),    2750);
    schedule(() => onComplete(),        3200);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Typewriter ─────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "tagline") return;
    setTagChars(0);
    const interval = setInterval(() => {
      setTagChars(prev => {
        if (prev >= TAGLINE.length) { clearInterval(interval); return prev; }
        return prev + 1;
      });
    }, 38); // ~38ms per char = ~760ms for 20 chars
    return () => clearInterval(interval);
  }, [phase]);

  // ─── Cursor blink ───────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "tagline" && phase !== "hold") { setCursorOn(false); return; }
    const interval = setInterval(() => setCursorOn(p => !p), 500);
    return () => clearInterval(interval);
  }, [phase]);

  // ─── Derived visibility flags ───────────────────────────────────
  const showTeaser  = phase === "teaser";
  const showLogo    = phase === "logo" || phase === "tagline" || phase === "hold" || phase === "exit";
  const showTagline = phase === "tagline" || phase === "hold" || phase === "exit";
  const isExiting   = phase === "exit";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        backgroundColor: "#1A2833",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        transition: isExiting ? "opacity 0.45s ease-out" : "opacity 0.3s ease-in",
        opacity: isExiting ? 0 : 1,
      }}
    >
      {/* Grid */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(205,255,101,0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(205,255,101,0.05) 1px, transparent 1px)
          `,
          backgroundSize: "72px 72px",
          transition: "opacity 0.5s",
          opacity: phase === "dark" ? 0 : 0.7,
        }}
      />

      {/* Purple glow top-left */}
      <div
        style={{
          position: "absolute",
          top: "-15%",
          left: "-10%",
          width: "60vmax",
          height: "60vmax",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(89,36,198,0.18) 0%, transparent 60%)",
          transition: "opacity 0.5s",
          opacity: phase === "dark" ? 0 : 1,
        }}
      />

      {/* Orange glow bottom-right */}
      <div
        style={{
          position: "absolute",
          bottom: "-15%",
          right: "-10%",
          width: "50vmax",
          height: "50vmax",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,191,0,0.12) 0%, transparent 60%)",
          transition: "opacity 0.5s",
          opacity: phase === "dark" ? 0 : 1,
        }}
      />

      {/* Vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {/* ── Teaser text ── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          transform: showTeaser ? "translateY(0)" : "translateY(40px)",
          opacity: showTeaser ? 1 : 0,
          transition: showTeaser
            ? "opacity 0.35s ease-out, transform 0.35s cubic-bezier(0.2,0.8,0.3,1)"
            : "opacity 0.2s ease-in, transform 0.2s ease-in",
        }}
      >
        {/* Line 1 */}
        <div style={{ textAlign: "center", padding: "0 32px" }}>
          <span
            style={{
              fontFamily: "'Lexend', sans-serif",
              fontWeight: 900,
              fontSize: "clamp(32px, 8vw, 56px)",
              color: "#CDFF65",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              lineHeight: 1.1,
              display: "block",
              textShadow: "0 0 30px rgba(205,255,101,0.4)",
            }}
          >
            YOUR GAME.
          </span>
          <span
            style={{
              fontFamily: "'Lexend', sans-serif",
              fontWeight: 900,
              fontSize: "clamp(32px, 8vw, 56px)",
              color: "#CDFF65",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              lineHeight: 1.1,
              display: "block",
              textShadow: "0 0 30px rgba(205,255,101,0.4)",
            }}
          >
            YOUR CLUB.
          </span>
        </div>

        {/* Line 2 */}
        <div
          style={{
            textAlign: "center",
            padding: "0 48px",
            opacity: showTeaser ? 1 : 0,
            transition: "opacity 0.3s ease-out 0.15s",
          }}
        >
          <span
            style={{
              fontFamily: "'Manrope', sans-serif",
              fontWeight: 600,
              fontSize: "clamp(12px, 3.2vw, 20px)",
              color: "rgba(173,191,240,0.75)",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
            }}
          >
            LONDON PADEL WILL NEVER BE THE SAME.
          </span>
        </div>
      </div>

      {/* ── Logo + Tagline ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 28,
          zIndex: 1,
        }}
      >
        {/* Logo — slams in from top */}
        <div
          style={{
            transform: showLogo ? "translateY(0)" : "translateY(-120vh)",
            opacity: showLogo ? 1 : 0,
            transition: showLogo
              ? "transform 0.55s cubic-bezier(0.2,1.4,0.3,1), opacity 0.25s ease-out"
              : "none",
            filter: "drop-shadow(0 0 24px rgba(205,255,101,0.35))",
          }}
        >
          <div
            style={{
              borderRadius: "18px",
              overflow: "hidden",
              boxShadow: "0 0 40px 8px rgba(205,255,101,0.18), 0 20px 50px rgba(0,0,0,0.6)",
            }}
          >
            <img
              src={xplayLogoFull}
              alt="XPLAY"
              style={{
                display: "block",
                width: "clamp(200px, 52vw, 320px)",
              }}
            />
          </div>
        </div>

      </div>

      {/* Bottom glow line */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 2,
          background: "linear-gradient(90deg, transparent, #CDFF65, #FFBF00, transparent)",
          opacity: showLogo ? 1 : 0,
          transition: "opacity 0.4s ease-out 0.3s",
        }}
      />
    </div>
  );
}
