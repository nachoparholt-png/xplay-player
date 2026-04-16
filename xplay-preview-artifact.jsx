
import { useState, useEffect, useRef, useCallback } from "react";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function springVal(frame, cfg = {}) {
  const { damping = 10, stiffness = 100, mass = 1 } = cfg;
  const dt = 1 / 30;
  let pos = 0, vel = 0;
  const steps = Math.min(Math.max(0, Math.round(frame)), 600);
  for (let i = 0; i < steps; i++) {
    const acc = (-stiffness * (pos - 1) - damping * vel) / mass;
    vel += acc * dt;
    pos += vel * dt;
  }
  return clamp(pos, -0.5, 1.5);
}

function lerp(value, [i0, i1], [o0, o1], opts = {}) {
  const { cl = false, easing } = opts;
  let t = (value - i0) / (i1 - i0);
  if (cl) t = clamp(t, 0, 1);
  if (easing) t = easing(clamp(t, 0, 1));
  return o0 + (o1 - o0) * t;
}

const easeOutCubic = t => 1 - (1 - t) ** 3;
const easeOutQuad  = t => 1 - (1 - t) ** 2;

const C = {
  bg:          "#0D0618",
  card:        "#150D27",
  primary:     "#AAFF2E",
  gold:        "#FFA800",
  purple:      "#5B2FCA",
  win:         "#31CC7A",
  loss:        "#E05555",
  white:       "#FFFAF0",
  muted:       "rgba(200,210,255,0.45)",
  mutedStrong: "rgba(200,210,255,0.70)",
};

const SPLASH_TOTAL    = 150;
const POSTMATCH_TOTAL = 330;

// ── Splash ─────────────────────────────────────────────────────────

function SplashFrame({ frame: f }) {
  const bgOp   = lerp(f, [0,15],   [0,1], { cl:true });
  const gridOp = lerp(f, [5,30],   [0,1], { cl:true });
  const iconSp = springVal(Math.max(0,f-15), { damping:12, stiffness:90, mass:0.9 });
  const iconScale = lerp(iconSp, [0,1], [0.4,1]);
  const iconOp = lerp(f, [15,35], [0,1], { cl:true });
  const wordSp = springVal(Math.max(0,f-25), { damping:14, stiffness:80 });
  const wordY  = lerp(wordSp, [0,1], [30,0]);
  const wordOp = lerp(f, [25,45], [0,1], { cl:true });
  const glow   = 20 + 12*Math.sin((f/30)*Math.PI*1.6);
  const barOp  = lerp(f, [48,60],  [0,1],   { cl:true });
  const barPct = lerp(f, [55,112], [0,100], { cl:true, easing:easeOutCubic });
  const tagOp  = lerp(f, [105,125],[0,1],   { cl:true });
  const tagY   = lerp(f, [105,125],[18,0],  { cl:true, easing:easeOutQuad });
  const vig    = 0.55+0.08*Math.sin((f/30)*Math.PI*0.9);
  const seeds  = [{x:12,y:18,s:3,d:0},{x:78,y:9,s:2,d:4},{x:55,y:72,s:4,d:7},{x:91,y:44,s:2,d:2},{x:34,y:88,s:3,d:10},{x:67,y:31,s:2,d:5},{x:22,y:60,s:4,d:1},{x:85,y:82,s:2,d:8},{x:44,y:15,s:3,d:3},{x:8,y:50,s:2,d:9}];

  return (
    <div style={{position:"absolute",inset:0,background:C.bg,opacity:bgOp,overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(0,0,0,${vig}) 100%)`}}/>
      <div style={{position:"absolute",inset:0,opacity:gridOp,backgroundImage:`linear-gradient(rgba(170,255,46,0.06) 1px, transparent 1px),linear-gradient(90deg,rgba(170,255,46,0.06) 1px,transparent 1px)`,backgroundSize:"80px 80px"}}/>
      <div style={{position:"absolute",top:-120,right:-80,width:400,height:400,borderRadius:"50%",background:`linear-gradient(135deg,${C.purple}22,transparent 65%)`,opacity:gridOp}}/>
      {seeds.map((p,i)=>{
        const op=lerp(f,[p.d,p.d+20],[0,0.55],{cl:true});
        const pulse=1+0.15*Math.sin((f/30)*Math.PI+i);
        return <div key={i} style={{position:"absolute",left:`${p.x}%`,top:`${p.y}%`,width:p.s*pulse,height:p.s*pulse,borderRadius:"50%",background:i%3===0?C.primary:C.purple,opacity:op,boxShadow:i%3===0?`0 0 6px 2px rgba(170,255,46,0.4)`:`0 0 6px 2px rgba(91,47,202,0.4)`}}/>;
      })}
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
        <div style={{transform:`scale(${iconScale})`,opacity:iconOp,marginBottom:32}}>
          <div style={{width:140,height:140,borderRadius:36,background:`linear-gradient(135deg,${C.primary},#78e000)`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 0 ${glow}px ${glow*0.6}px rgba(170,255,46,0.35),0 8px 32px rgba(0,0,0,0.6)`}}>
            <span style={{fontFamily:"'Lexend',sans-serif",fontWeight:900,fontSize:88,color:C.bg,lineHeight:1,letterSpacing:-4}}>X</span>
          </div>
        </div>
        <div style={{transform:`translateY(${wordY}px)`,opacity:wordOp,marginBottom:60}}>
          <span style={{fontFamily:"'Lexend',sans-serif",fontWeight:800,fontSize:68,color:C.white,letterSpacing:10}}>XPLAY</span>
        </div>
        <div style={{opacity:barOp,marginBottom:36}}>
          <div style={{width:260,height:3,background:"rgba(255,255,255,0.08)",borderRadius:3,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${barPct}%`,background:`linear-gradient(90deg,${C.primary},#78e000)`,borderRadius:3,boxShadow:`0 0 10px 2px rgba(170,255,46,0.55)`}}/>
          </div>
        </div>
        <div style={{opacity:tagOp,transform:`translateY(${tagY}px)`}}>
          <span style={{fontFamily:"'Manrope',sans-serif",fontWeight:500,fontSize:18,color:C.muted,letterSpacing:5,textTransform:"uppercase"}}>YOUR GAME. YOUR CLUB.</span>
        </div>
      </div>
      <div style={{position:"absolute",bottom:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${C.primary},transparent)`,opacity:barOp*(barPct/100)}}/>
    </div>
  );
}

// ── Post-Match ─────────────────────────────────────────────────────

function counter(from,to,start,end,f,dec=0){
  const p=lerp(f,[start,end],[0,1],{cl:true,easing:easeOutCubic});
  const v=from+(to-from)*p;
  return dec>0?v.toFixed(dec):Math.round(v).toString();
}

function StatCard({label,value,accent=C.primary,dx,op}){
  return(
    <div style={{transform:`translateX(${dx}px)`,opacity:op,flex:1,background:`linear-gradient(145deg,${C.card},#0f0920)`,border:`1px solid rgba(170,255,46,0.12)`,borderRadius:20,padding:"28px 20px 24px",display:"flex",flexDirection:"column",alignItems:"center",gap:8,boxShadow:"0 4px 24px rgba(0,0,0,0.5)"}}>
      <span style={{fontFamily:"'Lexend',sans-serif",fontWeight:800,fontSize:52,color:accent,lineHeight:1}}>{value}</span>
      <span style={{fontFamily:"'Manrope',sans-serif",fontWeight:600,fontSize:18,color:C.muted,textTransform:"uppercase",letterSpacing:2}}>{label}</span>
    </div>
  );
}

function PostMatchFrame({frame:f,result="win"}){
  const isWin=result==="win";
  const rc=isWin?C.win:C.loss;
  const bgOp=lerp(f,[0,12],[0,1],{cl:true});
  const resSp=springVal(Math.max(0,f-2),{damping:10,stiffness:150,mass:1.1});
  const resY=lerp(resSp,[0,1],[-320,0]);
  const resOp=lerp(f,[2,14],[0,1],{cl:true});
  const resGlow=25+12*Math.sin((f/30)*Math.PI*1.2);
  const scoreOp=lerp(f,[30,48],[0,1],{cl:true});
  const scoreSp=springVal(Math.max(0,f-30),{damping:14,stiffness:100});
  const scoreScl=lerp(scoreSp,[0,1],[0.7,1]);
  const scA=counter(0,3,35,70,f),scB=counter(0,1,45,75,f);
  function ca(d){const sp=springVal(Math.max(0,f-(80+d)),{damping:14,stiffness:85});return{dx:lerp(sp,[0,1],[-60,0]),op:lerp(f,[80+d,80+d+18],[0,1],{cl:true})};}
  const rA=ca(0),gA=ca(12),aA=ca(24),sA=ca(36);
  const rV=counter(0,8.5,85,140,f,1),gV=counter(0,2,97,145,f),aV=counter(0,1,109,148,f),sV=counter(0,6,121,152,f);
  const xpOp=lerp(f,[160,178],[0,1],{cl:true});
  const xpPct=lerp(f,[170,218],[0,100],{cl:true,easing:easeOutCubic});
  const xpV=counter(0,450,172,216,f);
  const xpGlow=8+4*Math.sin((f/30)*Math.PI*2.5);
  const mvpSp=springVal(Math.max(0,f-222),{damping:9,stiffness:100,mass:1.2});
  const mvpY=lerp(mvpSp,[0,1],[-80,0]);
  const mvpOp=lerp(f,[222,238],[0,1],{cl:true});
  const mvpGlow=18+10*Math.sin((f/30)*Math.PI*1.5);
  const ctaOp=lerp(f,[270,290],[0,1],{cl:true});
  const ctaPulse=1+0.025*Math.sin((f/30)*Math.PI*3);
  const px=56;

  return(
    <div style={{position:"absolute",inset:0,background:C.bg,opacity:bgOp,overflow:"hidden",fontFamily:"'Manrope',sans-serif"}}>
      <div style={{position:"absolute",top:-200,left:"50%",transform:"translateX(-50%)",width:900,height:900,borderRadius:"50%",background:isWin?`radial-gradient(circle,rgba(49,204,122,0.14) 0%,transparent 65%)`:`radial-gradient(circle,rgba(224,85,85,0.14) 0%,transparent 65%)`}}/>
      <div style={{position:"absolute",inset:0,opacity:0.7,backgroundImage:`linear-gradient(rgba(170,255,46,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(170,255,46,0.04) 1px,transparent 1px)`,backgroundSize:"80px 80px"}}/>
      <div style={{position:"absolute",top:130,left:0,right:0,display:"flex",flexDirection:"column",alignItems:"center",gap:12,transform:`translateY(${resY}px)`,opacity:resOp}}>
        <span style={{fontFamily:"'Manrope',sans-serif",fontWeight:600,fontSize:26,color:C.muted,letterSpacing:3,textTransform:"uppercase"}}>Nacho R.</span>
        <div style={{padding:"10px 52px",borderRadius:16,background:`${rc}18`,border:`2px solid ${rc}`,boxShadow:`0 0 ${resGlow}px ${resGlow*0.5}px ${rc}55`}}>
          <span style={{fontFamily:"'Lexend',sans-serif",fontWeight:900,fontSize:76,color:rc,letterSpacing:6,lineHeight:1}}>{isWin?"VICTORY":"DEFEAT"}</span>
        </div>
      </div>
      <div style={{position:"absolute",top:370,left:0,right:0,display:"flex",flexDirection:"column",alignItems:"center",gap:4,opacity:scoreOp,transform:`scale(${scoreScl})`}}>
        <div style={{display:"flex",alignItems:"center",gap:20}}>
          <span style={{fontFamily:"'Lexend',sans-serif",fontWeight:900,fontSize:128,color:isWin?C.win:C.white,lineHeight:1}}>{scA}</span>
          <span style={{fontFamily:"'Lexend',sans-serif",fontWeight:300,fontSize:72,color:C.muted,lineHeight:1,marginTop:-8}}>–</span>
          <span style={{fontFamily:"'Lexend',sans-serif",fontWeight:900,fontSize:128,color:isWin?C.mutedStrong:C.loss,lineHeight:1}}>{scB}</span>
        </div>
        <span style={{fontFamily:"'Manrope',sans-serif",fontSize:20,fontWeight:500,color:C.muted,letterSpacing:3,textTransform:"uppercase"}}>FINAL SCORE</span>
        <div style={{marginTop:16,width:280,height:1,background:`linear-gradient(90deg,transparent,${C.primary}40,transparent)`}}/>
      </div>
      <div style={{position:"absolute",top:640,left:px,right:px}}>
        <div style={{display:"flex",gap:16,marginBottom:16}}>
          <StatCard label="Rating"  value={rV} accent={C.gold}        dx={rA.dx} op={rA.op}/>
          <StatCard label="Goals"   value={gV} accent={C.primary}     dx={gA.dx} op={gA.op}/>
        </div>
        <div style={{display:"flex",gap:16}}>
          <StatCard label="Assists" value={aV} accent={C.primary}     dx={aA.dx} op={aA.op}/>
          <StatCard label="Shots"   value={sV} accent={C.mutedStrong} dx={sA.dx} op={sA.op}/>
        </div>
      </div>
      <div style={{position:"absolute",top:1100,left:px,right:px,opacity:xpOp}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:14}}>
          <span style={{fontFamily:"'Manrope',sans-serif",fontWeight:700,fontSize:22,color:C.mutedStrong,letterSpacing:2,textTransform:"uppercase"}}>XP Earned</span>
          <span style={{fontFamily:"'Lexend',sans-serif",fontWeight:800,fontSize:40,color:C.gold,letterSpacing:-1}}>+{xpV}</span>
        </div>
        <div style={{height:14,background:"rgba(255,255,255,0.07)",borderRadius:7,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${xpPct}%`,background:`linear-gradient(90deg,${C.gold},#ffcc44)`,borderRadius:7,boxShadow:`0 0 ${xpGlow}px ${xpGlow*0.4}px rgba(255,168,0,0.6)`}}/>
        </div>
        <div style={{marginTop:10,display:"flex",justifyContent:"space-between"}}>
          <span style={{fontFamily:"'Manrope',sans-serif",fontSize:18,color:C.muted,fontWeight:500}}>Level 12</span>
          <span style={{fontFamily:"'Manrope',sans-serif",fontSize:18,color:C.muted,fontWeight:500}}>2 450 / 3 000 XP</span>
        </div>
      </div>
      <div style={{position:"absolute",top:1340,left:0,right:0,display:"flex",justifyContent:"center",transform:`translateY(${mvpY}px)`,opacity:mvpOp}}>
        <div style={{display:"flex",alignItems:"center",gap:14,background:`linear-gradient(135deg,rgba(255,168,0,0.14),rgba(255,168,0,0.06))`,border:`1.5px solid rgba(255,168,0,0.55)`,borderRadius:50,padding:"16px 40px",boxShadow:`0 0 ${mvpGlow}px ${mvpGlow*0.5}px rgba(255,168,0,0.30)`}}>
          <svg width="36" height="30" viewBox="0 0 36 30" fill="none"><path d="M2 26 L8 10 L18 18 L28 4 L34 18 L34 26 Z" fill={C.gold} stroke={C.gold} strokeWidth="1.5" strokeLinejoin="round"/><rect x="2" y="26" width="32" height="3" rx="1.5" fill={C.gold}/></svg>
          <span style={{fontFamily:"'Lexend',sans-serif",fontWeight:800,fontSize:30,color:C.gold,letterSpacing:3,textTransform:"uppercase"}}>MVP of the Match</span>
        </div>
      </div>
      <div style={{position:"absolute",bottom:100,left:px,right:px,opacity:ctaOp,transform:`scale(${ctaPulse})`}}>
        <div style={{background:`linear-gradient(90deg,${C.primary},#78e000)`,borderRadius:20,padding:"28px 0",display:"flex",alignItems:"center",justifyContent:"center",gap:12,boxShadow:`0 4px 24px rgba(170,255,46,0.30)`}}>
          <span style={{fontFamily:"'Lexend',sans-serif",fontWeight:800,fontSize:28,color:C.bg,letterSpacing:1}}>See Full Stats</span>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke={C.bg} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
      </div>
    </div>
  );
}

// ── Phone shell ────────────────────────────────────────────────────

const SCALE=0.265,W=Math.round(1080*SCALE),H=Math.round(1920*SCALE);

function PhoneShell({children,label,frame,total,color}){
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
      <span style={{fontFamily:"'Manrope',sans-serif",fontWeight:700,fontSize:10,letterSpacing:3,textTransform:"uppercase",color:"rgba(200,210,255,0.4)"}}>{label}</span>
      <div style={{width:W+14,height:H+28,borderRadius:36,background:"linear-gradient(145deg,#1a1a2e,#0d0618)",border:"1.5px solid rgba(255,255,255,0.08)",boxShadow:"0 32px 80px rgba(0,0,0,0.7),0 0 0 1px rgba(255,255,255,0.04) inset",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"14px 7px",position:"relative"}}>
        <div style={{position:"absolute",top:10,left:"50%",transform:"translateX(-50%)",width:60,height:6,borderRadius:3,background:"rgba(255,255,255,0.08)"}}/>
        <div style={{width:W,height:H,borderRadius:24,overflow:"hidden",position:"relative",background:C.bg}}>
          {children}
        </div>
      </div>
      <div style={{width:W+14,height:2,background:"rgba(255,255,255,0.06)",borderRadius:2,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${(frame/total)*100}%`,background:color,borderRadius:2,boxShadow:`0 0 6px 1px ${color}80`}}/>
      </div>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────

export default function XPlayPreview(){
  const [sf,setSf]=useState(0);
  const [pf,setPf]=useState(0);
  const [playing,setPlaying]=useState(true);
  const [result,setResult]=useState("win");
  const rafRef=useRef(null);
  const lastTime=useRef(null);
  const acc=useRef(0);

  const tick=useCallback((ts)=>{
    if(lastTime.current!==null){
      acc.current+=(ts-lastTime.current);
      const fd=1000/30;
      while(acc.current>=fd){
        acc.current-=fd;
        setSf(f=>f>=SPLASH_TOTAL-1?0:f+1);
        setPf(f=>f>=POSTMATCH_TOTAL-1?0:f+1);
      }
    }
    lastTime.current=ts;
    rafRef.current=requestAnimationFrame(tick);
  },[]);

  useEffect(()=>{
    if(playing){lastTime.current=null;acc.current=0;rafRef.current=requestAnimationFrame(tick);}
    else cancelAnimationFrame(rafRef.current);
    return()=>cancelAnimationFrame(rafRef.current);
  },[playing,tick]);

  const btnBase={display:"flex",alignItems:"center",gap:8,borderRadius:50,padding:"10px 20px",cursor:"pointer",fontFamily:"'Manrope',sans-serif",fontWeight:700,fontSize:12,letterSpacing:1,border:"1px solid"};

  return(
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#07030f 0%,#0d0618 50%,#060210 100%)",display:"flex",flexDirection:"column",alignItems:"center",padding:"36px 20px 56px",fontFamily:"'Manrope',sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;600;700;800;900&family=Manrope:wght@400;500;600;700;800&display=swap');*{box-sizing:border-box;margin:0;padding:0;}`}</style>

      {/* Header */}
      <div style={{textAlign:"center",marginBottom:36}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:10}}>
          <div style={{width:28,height:28,borderRadius:7,background:"linear-gradient(135deg,#AAFF2E,#78e000)",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <span style={{fontFamily:"'Lexend',sans-serif",fontWeight:900,fontSize:17,color:"#0D0618"}}>X</span>
          </div>
          <span style={{fontFamily:"'Lexend',sans-serif",fontWeight:800,fontSize:18,color:"rgba(255,250,240,0.9)",letterSpacing:4}}>XPLAY</span>
        </div>
        <h1 style={{fontFamily:"'Lexend',sans-serif",fontWeight:800,fontSize:26,color:"#FFFAF0",letterSpacing:-0.5,marginBottom:6}}>Animation Preview</h1>
        <p style={{fontFamily:"'Manrope',sans-serif",fontWeight:500,fontSize:13,color:"rgba(200,210,255,0.4)",letterSpacing:1}}>Remotion compositions · 1080 × 1920 @ 30 fps</p>
      </div>

      {/* Controls */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:36,flexWrap:"wrap",justifyContent:"center"}}>
        <button onClick={()=>setPlaying(p=>!p)} style={{...btnBase,background:playing?"rgba(170,255,46,0.10)":"rgba(170,255,46,0.16)",borderColor:playing?"rgba(170,255,46,0.22)":"rgba(170,255,46,0.45)",color:"#AAFF2E"}}>
          {playing?<>⏸ PAUSE</>:<>▶ PLAY</>}
        </button>
        <button onClick={()=>{setSf(0);setPf(0);}} style={{...btnBase,background:"rgba(255,255,255,0.04)",borderColor:"rgba(255,255,255,0.08)",color:"rgba(200,210,255,0.5)"}}>
          ↺ RESTART
        </button>
        <button onClick={()=>setResult(r=>r==="win"?"loss":"win")} style={{...btnBase,background:result==="win"?"rgba(49,204,122,0.08)":"rgba(224,85,85,0.08)",borderColor:result==="win"?"rgba(49,204,122,0.3)":"rgba(224,85,85,0.3)",color:result==="win"?C.win:C.loss}}>
          {result==="win"?"✓ TOGGLE → LOSS":"✗ TOGGLE → WIN"}
        </button>
      </div>

      {/* Phones */}
      <div style={{display:"flex",gap:36,flexWrap:"wrap",justifyContent:"center",alignItems:"flex-start"}}>
        <PhoneShell label={`Loading Screen · ${sf}f`} frame={sf} total={SPLASH_TOTAL} color="#AAFF2E">
          <SplashFrame frame={sf}/>
        </PhoneShell>
        <PhoneShell label={`Post-Match Stats · ${pf}f`} frame={pf} total={POSTMATCH_TOTAL} color={result==="win"?C.win:C.loss}>
          <PostMatchFrame frame={pf} result={result}/>
        </PhoneShell>
      </div>

      <p style={{marginTop:40,fontFamily:"'Manrope',sans-serif",fontSize:11,color:"rgba(200,210,255,0.2)",letterSpacing:1,textAlign:"center"}}>
        Frame-perfect preview · animations mirror the Remotion compositions exactly
      </p>
    </div>
  );
}
