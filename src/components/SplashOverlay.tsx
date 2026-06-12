/**
 * SplashOverlay — animated app-open splash. "Arcade boot" edition.
 * ────────────────────────────────────────────────────────────────
 * 13 Jun feedback (Ignacio): keep the retro/Atari vibe of the original
 * splash + the handoff's retro mode, and animate the logo's PARTS —
 * not the square asset.
 *
 * The logo PNG was sliced into three real parts (chroma-keyed alpha,
 * recomposes pixel-perfect): X mark, play triangle, XPLAY wordmark.
 *
 * Sequence (~3.0s):
 *  0.00  phosphor grid + CRT scanlines flicker in
 *  0.15  square pixel ball serves in diagonally (segmented trail)
 *  0.70  impact — flash + square ring; the X SLAMS in (stamped)
 *  0.95  play triangle snaps in from the right, spring settle
 *  1.25  wordmark reveals left→right in chunky steps with a lime cursor
 *  1.80  lockup pulse + 2-frame chromatic glitch (amber/purple split)
 *  1.95  tagline types character-by-character, blinking block cursor
 *  3.00  exit fade
 * Reduced-motion: 400ms fade+scale of the full logo.
 */
import { useEffect, useState } from "react";
import xplayLogo from "@/assets/xplay-logo-full.png";
import partX from "@/assets/splash/logo-part-x.png";
import partPlay from "@/assets/splash/logo-part-play.png";
import partWordmark from "@/assets/splash/logo-part-wordmark.png";

// · = the interpunct as an explicit escape — immune to any file-encoding mangling
const TAGLINE = "PLAY \u00B7 COMPETE \u00B7 EARN";
const TYPE_START = 1950;
const TYPE_STEP = 30;

const SplashOverlay = ({ onDone }: { onDone: () => void }) => {
  const [exiting, setExiting] = useState(false);
  const [typed, setTyped] = useState("");
  const reduced = typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    // hide the native (static) splash as soon as our animated one is painted
    import("@capacitor/splash-screen")
      .then(({ SplashScreen }) => SplashScreen.hide())
      .catch(() => { /* web — no native splash */ });

    const total = reduced ? 1200 : 3000;
    const t1 = setTimeout(() => setExiting(true), total);
    const t2 = setTimeout(onDone, total + 380);

    // typed tagline (old-splash style, char by char)
    let typer: ReturnType<typeof setInterval> | undefined;
    const t3 = !reduced
      ? setTimeout(() => {
          let i = 0;
          typer = setInterval(() => {
            i += 1;
            setTyped(TAGLINE.slice(0, i));
            if (i >= TAGLINE.length && typer) clearInterval(typer);
          }, TYPE_STEP);
        }, TYPE_START)
      : undefined;

    return () => {
      clearTimeout(t1); clearTimeout(t2);
      if (t3) clearTimeout(t3);
      if (typer) clearInterval(typer);
    };
  }, [onDone, reduced]);

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
      style={{
        background: "#08060F",
        opacity: exiting ? 0 : 1,
        transition: "opacity 380ms ease",
        pointerEvents: "none",
      }}
    >
      <style>{`
        @keyframes xp-grid-in { 0% { opacity: 0; } 100% { opacity: 1; } }
        @keyframes xp-crtflick {
          0%, 96% { opacity: 0.5; } 97% { opacity: 0.28; }
          98% { opacity: 0.66; } 99% { opacity: 0.4; } 100% { opacity: 0.5; }
        }
        @keyframes xp-ball-move {
          0%   { transform: translate(-52vw, -44vh) rotate(-37deg); }
          100% { transform: translate(0, 0) rotate(-37deg); }
        }
        @keyframes xp-ball-fade {
          0% { opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { opacity: 0; }
        }
        @keyframes xp-flash {
          0% { transform: scale(0.3); opacity: 0; }
          35% { opacity: 0.95; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        @keyframes xp-ring {
          0% { transform: scale(0.4) rotate(45deg); opacity: 0; }
          30% { opacity: 0.8; }
          100% { transform: scale(3) rotate(45deg); opacity: 0; }
        }
        /* X — stamped in: huge → overshoot → seat */
        @keyframes xp-x-slam {
          0%   { transform: scale(2.6) rotate(-10deg); opacity: 0; }
          45%  { transform: scale(0.92) rotate(2deg); opacity: 1; }
          70%  { transform: scale(1.06) rotate(-1deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        /* play triangle — snaps in from the right, spring settle */
        @keyframes xp-play-snap {
          0%   { transform: translateX(58vw); opacity: 0; }
          8%   { opacity: 1; }
          62%  { transform: translateX(-7%); }
          82%  { transform: translateX(3%); }
          100% { transform: translateX(0); opacity: 1; }
        }
        /* wordmark — chunky stepped reveal left → right */
        @keyframes xp-word-reveal {
          0%   { clip-path: inset(0 100% 0 0); opacity: 1; }
          100% { clip-path: inset(0 0% 0 0); opacity: 1; }
        }
        @keyframes xp-word-cursor {
          0%   { left: 0%; opacity: 1; }
          92%  { opacity: 1; }
          100% { left: 100%; opacity: 0; }
        }
        @keyframes xp-pulse {
          0% { transform: scale(1); } 50% { transform: scale(1.04); } 100% { transform: scale(1); }
        }
        @keyframes xp-glitch {
          0%, 100% { transform: translate(0, 0) skewX(0deg); filter: none; }
          25% { transform: translate(-3px, 1px) skewX(-2deg);
                filter: drop-shadow(3px 0 0 rgba(255,191,0,0.8)) drop-shadow(-3px 0 0 rgba(89,36,198,0.8)); }
          50% { transform: translate(2px, -1px) skewX(1.5deg);
                filter: drop-shadow(-3px 0 0 rgba(255,191,0,0.8)) drop-shadow(3px 0 0 rgba(89,36,198,0.8)); }
          75% { transform: translate(-1px, 0) skewX(0deg); filter: none; }
        }
        @keyframes xp-cursor-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
        @keyframes xp-fade-scale {
          0% { opacity: 0; transform: scale(0.96); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {/* phosphor grid (handoff retro mode) */}
      {!reduced && (
        <div
          className="absolute inset-0"
          style={{
            animation: "xp-grid-in 250ms ease-out both",
            background: [
              "radial-gradient(120% 80% at 50% 40%, rgba(205,255,101,0.07), transparent 62%)",
              "repeating-linear-gradient(90deg, rgba(205,255,101,0.028) 0, rgba(205,255,101,0.028) 1px, transparent 1px, transparent 15px)",
              "repeating-linear-gradient(0deg, rgba(205,255,101,0.028) 0, rgba(205,255,101,0.028) 1px, transparent 1px, transparent 15px)",
            ].join(","),
          }}
        />
      )}

      {reduced ? (
        /* SP2 — reduced motion: simple fade + scale of the full logo */
        <img
          src={xplayLogo}
          alt=""
          className="w-44 h-44 rounded-3xl"
          style={{ animation: "xp-fade-scale 400ms ease-out both" }}
        />
      ) : (
        <>
          {/* serve — square pixel ball + segmented trail (0.15–0.70s) */}
          <div
            className="absolute"
            style={{
              animation:
                "xp-ball-move 550ms cubic-bezier(0.55,0.06,0.90,0.25) 150ms both, xp-ball-fade 580ms linear 150ms both",
            }}
          >
            <div
              style={{
                width: 170, height: 12,
                transformOrigin: "right center",
                background:
                  "repeating-linear-gradient(to left, rgba(205,255,101,0.95) 0, rgba(205,255,101,0.95) 9px, transparent 9px, transparent 17px)",
              }}
            />
            <div
              style={{
                position: "absolute", right: -8, top: -2,
                width: 16, height: 16, background: "#EAFFB0",
                boxShadow: "0 0 0 4px rgba(205,255,101,0.25), 0 0 18px 5px rgba(205,255,101,0.85)",
              }}
            />
          </div>

          {/* impact — flash + square ring (0.70s) */}
          <div
            className="absolute rounded-full"
            style={{
              width: 120, height: 120, mixBlendMode: "screen",
              background: "radial-gradient(circle, rgba(205,255,101,0.95) 0%, rgba(205,255,101,0) 70%)",
              animation: "xp-flash 300ms cubic-bezier(0.16,1,0.30,1) 700ms both",
            }}
          />
          <div
            className="absolute"
            style={{
              width: 110, height: 110, border: "3px solid rgba(205,255,101,0.8)",
              animation: "xp-ring 360ms cubic-bezier(0.16,1,0.30,1) 720ms both",
            }}
          />

          {/* logo stage — the three REAL parts assemble into the lockup */}
          <div
            className="relative"
            style={{
              width: 200, height: 200,
              animation: "xp-pulse 280ms ease-in-out 1800ms, xp-glitch 220ms steps(4) 1820ms",
            }}
          >
            {/* X mark — slams in (box 10.4/19.4 · 42.6×48.4 % of 500px master) */}
            <img
              src={partX} alt=""
              className="absolute"
              style={{
                left: "10.4%", top: "19.4%", width: "42.6%", height: "48.4%",
                animation: "xp-x-slam 420ms cubic-bezier(0.22,1.4,0.36,1) 700ms both",
                filter: "drop-shadow(0 0 18px rgba(205,255,101,0.4))",
              }}
            />
            {/* play triangle — snaps in from the right (52.2/19.4 · 38×48.4) */}
            <img
              src={partPlay} alt=""
              className="absolute"
              style={{
                left: "52.2%", top: "19.4%", width: "38%", height: "48.4%",
                animation: "xp-play-snap 460ms cubic-bezier(0.34,1.45,0.64,1) 950ms both",
                filter: "drop-shadow(0 0 18px rgba(205,255,101,0.4))",
              }}
            />
            {/* wordmark — stepped arcade reveal (9.4/68.2 · 81.2×20) */}
            <div
              className="absolute"
              style={{ left: "9.4%", top: "68.2%", width: "81.2%", height: "20%" }}
            >
              <img
                src={partWordmark} alt="XPLAY"
                className="absolute inset-0 w-full h-full"
                style={{ animation: "xp-word-reveal 480ms steps(9, end) 1250ms both", opacity: 0 }}
              />
              <div
                className="absolute"
                style={{
                  top: "-6%", bottom: "-6%", width: 7, background: "#CDFF65",
                  boxShadow: "0 0 12px rgba(205,255,101,0.9)",
                  animation: "xp-word-cursor 480ms steps(9, end) 1250ms both",
                  opacity: 0,
                }}
              />
            </div>
          </div>

          {/* tagline — typed char-by-char, blinking block cursor */}
          <div
            className="absolute bottom-[17%] font-mono text-[11px] font-bold"
            style={{
              color: "#CDFF65",
              letterSpacing: "0.22em",
              textShadow: "0 0 9px rgba(205,255,101,0.85)",
              minHeight: 16,
            }}
          >
            {typed}
            {typed.length > 0 && typed.length <= TAGLINE.length && (
              <span style={{ animation: "xp-cursor-blink 700ms step-end infinite" }}>▌</span>
            )}
          </div>

          {/* CRT scanlines + flicker — above everything */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "repeating-linear-gradient(0deg, rgba(0,0,0,0.30) 0, rgba(0,0,0,0.30) 1px, transparent 1px, transparent 3px)",
              animation: "xp-crtflick 6s steps(40) infinite",
            }}
          />
          {/* vignette */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(125% 120% at 50% 50%, transparent 55%, rgba(0,0,0,0.6) 100%)",
            }}
          />
        </>
      )}
    </div>
  );
};

export default SplashOverlay;
