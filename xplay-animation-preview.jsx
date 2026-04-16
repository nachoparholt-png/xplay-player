import { useState, useEffect, useRef, useCallback } from "react";

/* ── Brand tokens ─────────────────────────────────────── */
const C = {
  bg:     "#1A2833",
  purple: "#5924C6",
  lime:   "#CDFF65",
  orange: "#FFBF00",
  blue:   "#ADBFF0",
  white:  "#FFFFFF",
  card:   "#0F1D27",
  win:    "#CDFF65",
  loss:   "#FF4D4D",
};
const FPS = 30;

/* ── Animation math helpers ────────────────────────────── */
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function interpolate(value, [inStart, inEnd], [outStart, outEnd], opts = {}) {
  let t = (value - inStart) / (inEnd - inStart);
  if (opts.extrapolateLeft  === "clamp") t = Math.max(0, t);
  if (opts.extrapolateRight === "clamp") t = Math.min(1, t);
  if (opts.easing) t = opts.easing(clamp(t, 0, 1));
  return outStart + t * (outEnd - outStart);
}

// Easing helpers
const Easing = {
  out: (fn) => (t) => 1 - fn(1 - t),
  cubic: (t) => t * t * t,
  quad:  (t) => t * t,
};

function spring(frame, fps, config = {}) {
  const { damping = 14, stiffness = 120, mass = 1 } = config;
  if (frame <= 0) return 0;
  const w0   = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const t    = frame / fps;
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const val = 1 - Math.exp(-zeta * w0 * t) *
      (Math.cos(wd * t) + (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(wd * t));
    return clamp(val, 0, 1);
  }
  return clamp(1 - Math.exp(-w0 * t) * (1 + w0 * t), 0, 1);
}

/* ── XPLAY Logo SVG ─────────────────────────────────────── */
function XPlayLogo({ size = 280 }) {
  const s = size;
  return (
    <svg width={s} height={s * 1.05} viewBox="0 0 320 336" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Purple shadow layer */}
      <path d="M12 12 L108 142 L12 272" stroke="#5924C6" strokeWidth="54" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M118 12 L22 142 L118 272" stroke="#5924C6" strokeWidth="54" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M152 28 L308 142 L152 256 Z" fill="#5924C6"/>
      {/* Orange outline layer */}
      <path d="M12 12 L108 142 L12 272" stroke="#FFBF00" strokeWidth="44" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M118 12 L22 142 L118 272" stroke="#FFBF00" strokeWidth="44" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M155 36 L300 142 L155 248 Z" fill="#FFBF00"/>
      {/* Lime fill layer */}
      <path d="M12 12 L108 142 L12 272" stroke="#CDFF65" strokeWidth="32" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M118 12 L22 142 L118 272" stroke="#CDFF65" strokeWidth="32" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M160 46 L290 142 L160 238 Z" fill="#CDFF65"/>
      {/* XPLAY wordmark */}
      <text x="162" y="322" textAnchor="middle" fontFamily="'Arial Black',sans-serif" fontWeight="900" fontSize="72" fill="#5924C6" letterSpacing="4">XPLAY</text>
      <text x="160" y="320" textAnchor="middle" fontFamily="'Arial Black',sans-serif" fontWeight="900" fontSize="72" fill="none" stroke="#FFBF00" strokeWidth="8" letterSpacing="4">XPLAY</text>
      <text x="160" y="320" textAnchor="middle" fontFamily="'Arial Black',sans-serif" fontWeight="900" fontSize="72" fill="#FFFFFF" letterSpacing="4">XPLAY</text>
    </svg>
  );
}

/* ════════════════════════════════════════════════════════
   ANIMATION 1 — SPLASH SCREEN  (150 frames / 5 s)
   ════════════════════════════════════════════════════════ */
function SplashFrame({ frame }) {
  const fps = FPS;

  const bgOp   = interpolate(frame, [0, 20],   [0, 1],   { extrapolateRight: "clamp" });
  const gridOp = interpolate(frame, [5, 30],   [0, 1],   { extrapolateRight: "clamp" });

  const logoSp    = spring(Math.max(0, frame - 15), fps, { damping: 11, stiffness: 90, mass: 0.9 });
  const logoScale = interpolate(logoSp, [0, 1], [0.3, 1]);
  const logoOp    = interpolate(frame, [15, 38], [0, 1], { extrapolateRight: "clamp" });
  const logoGlow  = 30 + 14 * Math.sin((frame / fps) * Math.PI * 1.4);

  const barOp  = interpolate(frame, [58, 70],  [0, 1],   { extrapolateRight: "clamp" });
  const barPct = interpolate(frame, [65, 115], [0, 100], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const barR = Math.round(interpolate(barPct, [0, 100], [0xCD, 0xFF], { extrapolateRight: "clamp" }));
  const barG = Math.round(interpolate(barPct, [0, 100], [0xFF, 0xBF], { extrapolateRight: "clamp" }));
  const barB = Math.round(interpolate(barPct, [0, 100], [0x65, 0x00], { extrapolateRight: "clamp" }));
  const barColor = `rgb(${barR},${barG},${barB})`;

  const tagOp = interpolate(frame, [108, 128], [0, 1], { extrapolateRight: "clamp" });
  const tagY  = interpolate(frame, [108, 128], [20, 0], {
    extrapolateRight: "clamp", easing: Easing.out(Easing.quad),
  });

  const seeds = [
    { x: 8,  y: 12, s: 4, d: 0,  col: C.lime   },
    { x: 82, y: 7,  s: 3, d: 5,  col: C.orange  },
    { x: 55, y: 78, s: 5, d: 8,  col: C.purple  },
    { x: 91, y: 42, s: 3, d: 3,  col: C.lime    },
    { x: 28, y: 91, s: 4, d: 11, col: C.orange  },
    { x: 70, y: 28, s: 3, d: 6,  col: C.purple  },
    { x: 18, y: 62, s: 5, d: 2,  col: C.lime    },
    { x: 88, y: 85, s: 3, d: 9,  col: C.orange  },
    { x: 44, y: 18, s: 4, d: 4,  col: C.purple  },
    { x: 5,  y: 52, s: 3, d: 10, col: C.lime    },
  ];

  return (
    <div style={{
      position: "relative", width: "100%", height: "100%",
      backgroundColor: C.bg, opacity: bgOp, overflow: "hidden",
    }}>
      {/* Vignette */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,0.55) 100%)",
      }}/>
      {/* Grid */}
      <div style={{
        position: "absolute", inset: 0, opacity: gridOp,
        backgroundImage: `
          linear-gradient(rgba(205,255,101,0.06) 1px, transparent 1px),
          linear-gradient(90deg, rgba(205,255,101,0.06) 1px, transparent 1px)`,
        backgroundSize: "60px 60px",
      }}/>
      {/* Purple glow top-left */}
      <div style={{
        position: "absolute", top: -100, left: -60,
        width: 350, height: 350, borderRadius: "50%",
        background: `radial-gradient(circle, ${C.purple}28 0%, transparent 65%)`,
        opacity: gridOp,
      }}/>
      {/* Orange glow bottom-right */}
      <div style={{
        position: "absolute", bottom: -80, right: -40,
        width: 300, height: 300, borderRadius: "50%",
        background: `radial-gradient(circle, ${C.orange}20 0%, transparent 65%)`,
        opacity: gridOp,
      }}/>
      {/* Particles */}
      {seeds.map((p, i) => {
        const op    = interpolate(frame, [p.d, p.d + 22], [0, 0.6], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const pulse = 1 + 0.2 * Math.sin((frame / fps) * Math.PI + i);
        return (
          <div key={i} style={{
            position: "absolute",
            left: `${p.x}%`, top: `${p.y}%`,
            width: p.s * pulse, height: p.s * pulse,
            borderRadius: "50%", backgroundColor: p.col,
            opacity: op, boxShadow: `0 0 8px 3px ${p.col}55`,
          }}/>
        );
      })}
      {/* Centre content */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        <div style={{
          transform: `scale(${logoScale})`, opacity: logoOp,
          marginBottom: 12,
          filter: `drop-shadow(0 0 ${logoGlow}px ${C.lime}66)`,
        }}>
          <XPlayLogo size={160}/>
        </div>
        {/* Loading bar */}
        <div style={{ opacity: barOp, marginBottom: 24 }}>
          <div style={{
            width: 200, height: 3,
            backgroundColor: "rgba(255,255,255,0.08)",
            borderRadius: 4, overflow: "hidden",
          }}>
            <div style={{
              height: "100%", width: `${barPct}%`,
              background: barColor, borderRadius: 4,
              boxShadow: `0 0 8px 2px ${barColor}88`,
            }}/>
          </div>
        </div>
        {/* Tagline */}
        <div style={{ opacity: tagOp, transform: `translateY(${tagY}px)` }}>
          <span style={{
            fontFamily: "sans-serif", fontWeight: 600, fontSize: 11,
            color: C.blue, letterSpacing: 4, textTransform: "uppercase",
          }}>
            YOUR GAME. YOUR CLUB.
          </span>
        </div>
      </div>
      {/* Bottom glow line */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent, ${C.lime}, ${C.orange}, transparent)`,
        opacity: barOp * (barPct / 100),
      }}/>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   ANIMATION 2 — POST-MATCH STATS  (330 frames / 11 s)
   ════════════════════════════════════════════════════════ */
function PostMatchFrame({ frame, props }) {
  const fps = FPS;
  const {
    result = "win", scoreA = 3, scoreB = 1,
    rating = 8.5, goals = 2, assists = 1, shots = 6,
    playerName = "Nacho R.", xpEarned = 450, isMVP = true,
  } = props;

  const isWin       = result === "win";
  const resultColor = isWin ? C.win : C.loss;
  const resultText  = isWin ? "VICTORY" : "DEFEAT";

  /* BG */
  const bgOp = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  /* Header slam */
  const headerSp    = spring(Math.max(0, frame), fps, { damping: 10, stiffness: 200, mass: 0.7 });
  const headerScale = interpolate(headerSp, [0, 1], [2.5, 1]);
  const headerOp    = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });

  /* Score count-up */
  const scoreProgress = interpolate(frame, [30, 80], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const displayScoreA = Math.round(scoreProgress * scoreA);
  const displayScoreB = Math.round(scoreProgress * scoreB);
  const scoreOp  = interpolate(frame, [28, 45], [0, 1], { extrapolateRight: "clamp" });

  /* Player name */
  const nameOp = interpolate(frame, [20, 40], [0, 1], { extrapolateRight: "clamp" });
  const nameY  = interpolate(frame, [20, 40], [16, 0], {
    extrapolateRight: "clamp", easing: Easing.out(Easing.quad),
  });

  /* Stat cards stagger */
  const stats = [
    { label: "RATING", value: rating.toFixed(1), color: C.lime   },
    { label: "GOALS",  value: goals,              color: C.orange },
    { label: "ASSISTS",value: assists,            color: C.blue   },
    { label: "SHOTS",  value: shots,              color: C.white  },
  ];

  /* XP bar */
  const xpOp  = interpolate(frame, [158, 175], [0, 1], { extrapolateRight: "clamp" });
  const xpPct = interpolate(frame, [165, 215], [0, 100], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const displayXP = Math.round((xpPct / 100) * xpEarned);

  /* MVP badge */
  const mvpSp    = spring(Math.max(0, frame - 220), fps, { damping: 9, stiffness: 160, mass: 0.8 });
  const mvpScale = interpolate(mvpSp, [0, 1], [0, 1]);
  const mvpOp    = interpolate(frame, [220, 235], [0, 1], { extrapolateRight: "clamp" });

  /* CTA pulse */
  const ctaOp    = interpolate(frame, [268, 285], [0, 1], { extrapolateRight: "clamp" });
  const ctaPulse = 1 + 0.04 * Math.sin((frame / fps) * Math.PI * 3);

  return (
    <div style={{
      position: "relative", width: "100%", height: "100%",
      backgroundColor: C.bg, opacity: bgOp, overflow: "hidden",
    }}>
      {/* Background glows */}
      <div style={{
        position: "absolute", top: -80, left: -60, width: 350, height: 350,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${isWin ? C.lime : C.loss}18 0%, transparent 65%)`,
      }}/>
      <div style={{
        position: "absolute", bottom: -80, right: -40, width: 300, height: 300,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${C.purple}20 0%, transparent 65%)`,
      }}/>
      {/* Grid */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `
          linear-gradient(rgba(205,255,101,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(205,255,101,0.04) 1px, transparent 1px)`,
        backgroundSize: "50px 50px",
      }}/>

      {/* Main content */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "flex-start",
        paddingTop: 32, paddingBottom: 20,
        gap: 0,
      }}>
        {/* Mini logo */}
        <div style={{ opacity: nameOp, transform: `translateY(${nameY}px)`, marginBottom: 6 }}>
          <XPlayLogo size={50}/>
        </div>

        {/* VICTORY / DEFEAT slam */}
        <div style={{
          transform: `scale(${headerScale})`, opacity: headerOp,
          marginBottom: 4,
        }}>
          <span style={{
            fontFamily: "'Arial Black', sans-serif", fontWeight: 900, fontSize: 32,
            color: resultColor, letterSpacing: 3,
            textShadow: `0 0 20px ${resultColor}88, 0 0 40px ${resultColor}44`,
          }}>
            {resultText}
          </span>
        </div>

        {/* Player name */}
        <div style={{ opacity: nameOp, transform: `translateY(${nameY}px)`, marginBottom: 10 }}>
          <span style={{
            fontFamily: "sans-serif", fontWeight: 700, fontSize: 13,
            color: C.blue, letterSpacing: 3, textTransform: "uppercase",
          }}>
            {playerName}
          </span>
        </div>

        {/* Score */}
        <div style={{ opacity: scoreOp, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{
              fontFamily: "'Arial Black', sans-serif", fontWeight: 900, fontSize: 54,
              color: C.white, textShadow: `0 0 20px ${resultColor}55`,
            }}>
              {displayScoreA}
            </span>
            <span style={{
              fontFamily: "sans-serif", fontWeight: 300, fontSize: 24, color: "rgba(255,255,255,0.3)",
            }}>–</span>
            <span style={{
              fontFamily: "'Arial Black', sans-serif", fontWeight: 900, fontSize: 54,
              color: "rgba(255,255,255,0.5)",
            }}>
              {displayScoreB}
            </span>
          </div>
        </div>

        {/* Stat cards */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr",
          gap: 8, width: "88%", marginBottom: 14,
        }}>
          {stats.map((stat, i) => {
            const cardOp = interpolate(frame, [82 + i * 14, 105 + i * 14], [0, 1], { extrapolateRight: "clamp" });
            const cardY  = interpolate(frame, [82 + i * 14, 105 + i * 14], [20, 0], {
              extrapolateRight: "clamp", easing: Easing.out(Easing.quad),
            });
            return (
              <div key={i} style={{
                backgroundColor: C.card, borderRadius: 10, padding: "10px 12px",
                border: `1px solid rgba(255,255,255,0.06)`,
                opacity: cardOp, transform: `translateY(${cardY}px)`,
              }}>
                <div style={{ fontFamily: "sans-serif", fontSize: 8, color: "rgba(255,255,255,0.4)", letterSpacing: 2, marginBottom: 4 }}>
                  {stat.label}
                </div>
                <div style={{
                  fontFamily: "'Arial Black', sans-serif", fontWeight: 900, fontSize: 24,
                  color: stat.color,
                }}>
                  {stat.value}
                </div>
              </div>
            );
          })}
        </div>

        {/* XP Bar */}
        <div style={{ opacity: xpOp, width: "88%", marginBottom: 14 }}>
          <div style={{
            backgroundColor: C.card, borderRadius: 10, padding: "10px 12px",
            border: "1px solid rgba(255,255,255,0.06)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontFamily: "sans-serif", fontSize: 8, color: "rgba(255,255,255,0.4)", letterSpacing: 2 }}>XP EARNED</span>
              <span style={{ fontFamily: "'Arial Black',sans-serif", fontWeight: 900, fontSize: 13, color: C.orange }}>+{displayXP}</span>
            </div>
            <div style={{ height: 5, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${xpPct}%`,
                background: `linear-gradient(90deg, ${C.purple}, ${C.orange})`,
                borderRadius: 3,
                boxShadow: `0 0 10px ${C.orange}66`,
              }}/>
            </div>
          </div>
        </div>

        {/* MVP Badge */}
        {isMVP && (
          <div style={{
            transform: `scale(${mvpScale})`, opacity: mvpOp, marginBottom: 14,
          }}>
            <div style={{
              background: `linear-gradient(135deg, ${C.orange}, ${C.lime})`,
              borderRadius: 30, padding: "8px 22px",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 16 }}>⭐</span>
              <span style={{
                fontFamily: "'Arial Black', sans-serif", fontWeight: 900, fontSize: 13,
                color: C.bg, letterSpacing: 2,
              }}>
                MVP
              </span>
            </div>
          </div>
        )}

        {/* CTA */}
        <div style={{ opacity: ctaOp, transform: `scale(${ctaPulse})`, width: "88%" }}>
          <div style={{
            background: `linear-gradient(90deg, ${C.purple}, ${C.lime})`,
            borderRadius: 12, padding: "12px 24px",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            <span style={{
              fontFamily: "'Arial Black', sans-serif", fontWeight: 900, fontSize: 14,
              color: C.bg, letterSpacing: 1,
            }}>
              PLAY NEXT MATCH
            </span>
            <span style={{ fontSize: 14 }}>▶</span>
          </div>
        </div>
      </div>

      {/* Bottom glow line */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent, ${C.purple}, ${C.lime}, transparent)`,
        opacity: ctaOp,
      }}/>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   SCRUBBER + PLAYER CONTROLS
   ════════════════════════════════════════════════════════ */
function AnimationPlayer({ totalFrames, fps, children, label, duration }) {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef(null);
  const lastTimeRef = useRef(null);
  const frameRef = useRef(0);

  const tick = useCallback((timestamp) => {
    if (!lastTimeRef.current) lastTimeRef.current = timestamp;
    const elapsed = timestamp - lastTimeRef.current;
    const frameDuration = 1000 / fps;
    if (elapsed >= frameDuration) {
      const next = (frameRef.current + Math.floor(elapsed / frameDuration)) % totalFrames;
      frameRef.current = next;
      setFrame(next);
      lastTimeRef.current = timestamp - (elapsed % frameDuration);
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [fps, totalFrames]);

  useEffect(() => {
    if (playing) {
      lastTimeRef.current = null;
      rafRef.current = requestAnimationFrame(tick);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing, tick]);

  const handleScrub = (e) => {
    const v = parseInt(e.target.value);
    frameRef.current = v;
    setFrame(v);
  };

  const secs = (frame / fps).toFixed(1);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <div style={{
        background: "rgba(255,255,255,0.06)", borderRadius: 8,
        padding: "4px 14px", marginBottom: 2,
      }}>
        <span style={{ color: C.lime, fontFamily: "monospace", fontSize: 11, fontWeight: 700 }}>
          {label}
        </span>
        <span style={{ color: "rgba(255,255,255,0.4)", fontFamily: "monospace", fontSize: 11 }}>
          {" · "}{duration}
        </span>
      </div>

      {/* Phone frame */}
      <div style={{
        width: 240, height: 426,
        borderRadius: 28,
        border: "3px solid rgba(255,255,255,0.12)",
        background: C.bg,
        overflow: "hidden",
        boxShadow: `0 0 40px ${C.purple}33, 0 0 80px rgba(0,0,0,0.6)`,
        position: "relative",
      }}>
        {/* Notch */}
        <div style={{
          position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)",
          width: 60, height: 6, borderRadius: 3,
          background: "rgba(255,255,255,0.12)", zIndex: 10,
        }}/>
        {children(frame)}
      </div>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, width: 240 }}>
        <button
          onClick={() => setPlaying(p => !p)}
          style={{
            background: playing ? C.orange : C.lime,
            border: "none", borderRadius: 20, padding: "6px 14px",
            fontFamily: "'Arial Black',sans-serif", fontWeight: 900, fontSize: 11,
            color: C.bg, cursor: "pointer", minWidth: 60,
            boxShadow: `0 0 12px ${playing ? C.orange : C.lime}66`,
          }}
        >
          {playing ? "⏸ PAUSE" : "▶ PLAY"}
        </button>
        <button
          onClick={() => { setPlaying(false); frameRef.current = 0; setFrame(0); }}
          style={{
            background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 20, padding: "6px 10px",
            fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.6)",
            cursor: "pointer",
          }}
        >
          ↺
        </button>
        <span style={{ fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.4)", marginLeft: "auto" }}>
          {secs}s
        </span>
      </div>

      {/* Scrubber */}
      <div style={{ width: 240 }}>
        <input
          type="range" min={0} max={totalFrames - 1} value={frame}
          onChange={handleScrub}
          style={{ width: "100%", accentColor: C.lime, cursor: "pointer" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,0.25)" }}>0s</span>
          <span style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,0.25)" }}>
            f{frame}/{totalFrames - 1}
          </span>
          <span style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,0.25)" }}>
            {(totalFrames / fps).toFixed(0)}s
          </span>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   ROOT COMPONENT
   ════════════════════════════════════════════════════════ */
const postMatchProps = {
  result: "win", scoreA: 3, scoreB: 1,
  rating: 8.5, goals: 2, assists: 1, shots: 6,
  playerName: "Nacho R.", xpEarned: 450, isMVP: true,
};

export default function App() {
  const [activeTab, setActiveTab] = useState("splash");

  return (
    <div style={{
      minHeight: "100vh", backgroundColor: "#0A1520",
      display: "flex", flexDirection: "column",
      alignItems: "center", padding: "28px 20px 40px",
      fontFamily: "sans-serif",
    }}>
      {/* Header */}
      <div style={{ marginBottom: 24, textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 6 }}>
          <XPlayLogo size={32}/>
          <span style={{
            fontFamily: "'Arial Black',sans-serif", fontWeight: 900, fontSize: 18,
            color: C.white, letterSpacing: 2,
          }}>ANIMATION PREVIEW</span>
        </div>
        <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, margin: 0, letterSpacing: 1 }}>
          REMOTION STUDIO · REVIEW BEFORE APPLYING TO APP
        </p>
      </div>

      {/* Tab switcher */}
      <div style={{
        display: "flex", gap: 4, marginBottom: 24,
        background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 4,
      }}>
        {[
          { id: "splash",    label: "01 · SPLASH SCREEN",  frames: 150 },
          { id: "postmatch", label: "02 · POST-MATCH STATS", frames: 330 },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              background: activeTab === tab.id ? C.lime : "transparent",
              border: "none", borderRadius: 8,
              padding: "8px 14px",
              fontFamily: "'Arial Black',sans-serif", fontWeight: 700, fontSize: 10,
              color: activeTab === tab.id ? C.bg : "rgba(255,255,255,0.4)",
              cursor: "pointer", letterSpacing: 1,
              transition: "none",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Animation players */}
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap", justifyContent: "center" }}>
        {activeTab === "splash" ? (
          <AnimationPlayer totalFrames={150} fps={FPS} label="XPLAY SPLASH" duration="5s · 1080×1920">
            {(frame) => <SplashFrame frame={frame}/>}
          </AnimationPlayer>
        ) : (
          <AnimationPlayer totalFrames={330} fps={FPS} label="POST-MATCH STATS" duration="11s · 1080×1920">
            {(frame) => <PostMatchFrame frame={frame} props={postMatchProps}/>}
          </AnimationPlayer>
        )}
      </div>

      {/* Timeline legend */}
      <div style={{
        marginTop: 24, maxWidth: 520, width: "100%",
        background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: "14px 18px",
        border: "1px solid rgba(255,255,255,0.07)",
      }}>
        {activeTab === "splash" ? (
          <>
            <p style={{ color: C.lime, fontFamily: "monospace", fontSize: 10, fontWeight: 700, margin: "0 0 8px", letterSpacing: 2 }}>
              SPLASH TIMELINE
            </p>
            {[
              ["0–20",    "BG + grid fade in"],
              ["15–50",   "Logo spring-in with glow"],
              ["60–115",  "Loading bar fills (lime → orange)"],
              ["108–128", "Tagline slides up"],
              ["130–150", "Hold / loop point"],
            ].map(([t, d]) => (
              <div key={t} style={{ display: "flex", gap: 12, marginBottom: 4 }}>
                <span style={{ fontFamily: "monospace", fontSize: 9, color: C.orange, minWidth: 60 }}>{t}</span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{d}</span>
              </div>
            ))}
          </>
        ) : (
          <>
            <p style={{ color: C.lime, fontFamily: "monospace", fontSize: 10, fontWeight: 700, margin: "0 0 8px", letterSpacing: 2 }}>
              POST-MATCH TIMELINE
            </p>
            {[
              ["0–30",    "VICTORY/DEFEAT stamp slams in"],
              ["30–80",   "Score counts up (3–1)"],
              ["80–160",  "Stat cards stagger in (Rating, Goals, Assists, Shots)"],
              ["160–220", "XP bar fills (purple → orange gradient)"],
              ["220–270", "MVP badge bounces in"],
              ["270–300", "PLAY NEXT MATCH CTA pulses in"],
            ].map(([t, d]) => (
              <div key={t} style={{ display: "flex", gap: 12, marginBottom: 4 }}>
                <span style={{ fontFamily: "monospace", fontSize: 9, color: C.orange, minWidth: 60 }}>{t}</span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{d}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
