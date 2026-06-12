/**
 * SplashOverlay — animated app-open logo splash.
 * ────────────────────────────────────────────────
 * Ported from the Claude Design handoff (design-handoff-jun13-splash, SP4 spec)
 * with the REAL logo asset and extra logo animation the prototype couldn't do:
 *  - sticker-slap: two echo copies of the logo converge into the lockup,
 *    matching the asset's own layered-offset style
 *  - rotation settle (-6° → 0) on the same spring as the scale overshoot
 *  - shine sweep across the logo after lockup
 * Background #100622 = the logo PNG's own ground (it has no alpha channel),
 * so the square asset blends seamlessly; exit crossfades to the app shell.
 * Timeline ≤2.5s · transform/opacity/filter only · reduced-motion variant.
 */
import { useEffect, useState } from "react";
import xplayLogo from "@/assets/xplay-logo-full.png";

const SplashOverlay = ({ onDone }: { onDone: () => void }) => {
  const [exiting, setExiting] = useState(false);
  const reduced = typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    // hide the native (static) splash as soon as our animated one is painted
    import("@capacitor/splash-screen")
      .then(({ SplashScreen }) => SplashScreen.hide())
      .catch(() => { /* web — no native splash */ });

    const total = reduced ? 1200 : 2350;
    const t1 = setTimeout(() => setExiting(true), total);
    const t2 = setTimeout(onDone, total + 380);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone, reduced]);

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
      style={{
        background: "linear-gradient(180deg, #100622 0%, #0D0520 55%, #0A0F14 130%)",
        opacity: exiting ? 0 : 1,
        transition: "opacity 380ms ease",
        pointerEvents: "none",
      }}
    >
      <style>{`
        @keyframes xp-comet-move {
          0%   { transform: translate(-46vw, -42vh) rotate(-38deg); }
          100% { transform: translate(0, 0) rotate(-38deg); }
        }
        @keyframes xp-comet-fade {
          0% { opacity: 0; } 12% { opacity: 1; } 88% { opacity: 1; } 100% { opacity: 0; }
        }
        @keyframes xp-tail {
          0% { transform: scaleX(0.6); } 55% { transform: scaleX(1.5); } 100% { transform: scaleX(0.04); }
        }
        @keyframes xp-flash {
          0% { transform: scale(0.3); opacity: 0; }
          35% { opacity: 0.9; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        @keyframes xp-ring {
          0% { transform: scale(0.4); opacity: 0; }
          30% { opacity: 0.7; }
          100% { transform: scale(3); opacity: 0; }
        }
        @keyframes xp-logo-in {
          0%   { transform: scale(0.4) rotate(-6deg); opacity: 0; }
          10%  { opacity: 1; }
          70%  { transform: scale(1.08) rotate(2deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes xp-echo-a {
          0%   { transform: translate(-14px, 10px) scale(0.4) rotate(-6deg); opacity: 0; }
          25%  { opacity: 0.45; }
          100% { transform: translate(0, 0) scale(1); opacity: 0; }
        }
        @keyframes xp-echo-b {
          0%   { transform: translate(14px, -8px) scale(0.4) rotate(-6deg); opacity: 0; }
          25%  { opacity: 0.45; }
          100% { transform: translate(0, 0) scale(1); opacity: 0; }
        }
        @keyframes xp-glow {
          0% { opacity: 0; } 40% { opacity: 0.85; } 100% { opacity: 0.4; }
        }
        @keyframes xp-pulse {
          0% { transform: scale(1); } 50% { transform: scale(1.035); } 100% { transform: scale(1); }
        }
        @keyframes xp-shine {
          0% { transform: translateX(-130%) rotate(18deg); opacity: 0; }
          15% { opacity: 0.55; }
          100% { transform: translateX(130%) rotate(18deg); opacity: 0; }
        }
        @keyframes xp-tagline {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes xp-fade-scale {
          0% { opacity: 0; transform: scale(0.96); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {reduced ? (
        /* SP2 — reduced motion: simple fade + scale */
        <img
          src={xplayLogo}
          alt=""
          className="w-44 h-44 rounded-3xl"
          style={{ animation: "xp-fade-scale 400ms ease-out both" }}
        />
      ) : (
        <>
          {/* SP1 · serve — comet streak (0–950ms) */}
          <div
            className="absolute"
            style={{
              animation:
                "xp-comet-move 950ms cubic-bezier(0.55,0.06,0.90,0.25) both, xp-comet-fade 1000ms linear both",
            }}
          >
            <div
              style={{
                width: 180, height: 3, borderRadius: 999,
                background: "linear-gradient(90deg, transparent, #CDFF65)",
                transformOrigin: "right center",
                animation: "xp-tail 1000ms linear both",
                boxShadow: "0 0 12px rgba(205,255,101,0.8)",
              }}
            />
            <div
              style={{
                position: "absolute", right: -5, top: -4.5,
                width: 12, height: 12, borderRadius: 999, background: "#CDFF65",
                boxShadow: "0 0 18px 4px rgba(205,255,101,0.9)",
              }}
            />
          </div>

          {/* contact — flash + ring (900–1300ms) */}
          <div
            className="absolute rounded-full"
            style={{
              width: 120, height: 120,
              background: "radial-gradient(circle, rgba(205,255,101,0.95) 0%, rgba(205,255,101,0) 70%)",
              animation: "xp-flash 300ms cubic-bezier(0.16,1,0.30,1) 900ms both",
            }}
          />
          <div
            className="absolute rounded-full border-2"
            style={{
              width: 130, height: 130, borderColor: "rgba(205,255,101,0.8)",
              animation: "xp-ring 360ms cubic-bezier(0.16,1,0.30,1) 930ms both",
            }}
          />

          {/* settle — sticker-slap logo lockup (950ms →) */}
          <div className="relative" style={{ animation: "xp-pulse 300ms ease-in-out 1700ms" }}>
            {/* echo layers — the asset's own offset-sticker style, converging */}
            <img
              src={xplayLogo} alt="" className="absolute inset-0 w-44 h-44 rounded-3xl"
              style={{ animation: "xp-echo-a 550ms cubic-bezier(0.34,1.56,0.64,1) 950ms both", mixBlendMode: "screen" }}
            />
            <img
              src={xplayLogo} alt="" className="absolute inset-0 w-44 h-44 rounded-3xl"
              style={{ animation: "xp-echo-b 550ms cubic-bezier(0.34,1.56,0.64,1) 950ms both", mixBlendMode: "screen" }}
            />
            {/* main logo */}
            <img
              src={xplayLogo} alt="XPLAY" className="w-44 h-44 rounded-3xl relative"
              style={{
                animation: "xp-logo-in 550ms cubic-bezier(0.34,1.56,0.64,1) 950ms both, xp-glow 750ms ease-out 950ms both",
                filter: "drop-shadow(0 0 24px rgba(205,255,101,0.45))",
              }}
            />
            {/* shine sweep after lockup */}
            <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
              <div
                style={{
                  position: "absolute", top: "-20%", bottom: "-20%", width: "34%",
                  background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)",
                  animation: "xp-shine 600ms ease-in-out 1750ms both",
                }}
              />
            </div>
          </div>

          {/* tagline */}
          <div
            className="absolute bottom-[18%] font-display text-[11px] font-extrabold uppercase"
            style={{
              color: "#B4CBD5", letterSpacing: "0.35em",
              animation: "xp-tagline 400ms ease-out 1800ms both",
            }}
          >
            Play · Compete · Earn
          </div>
        </>
      )}
    </div>
  );
};

export default SplashOverlay;
