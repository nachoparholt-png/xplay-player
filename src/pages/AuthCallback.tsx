import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const AuthCallback = () => {
  const navigate = useNavigate();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      const code = new URLSearchParams(window.location.search).get("code");

      if (!code) {
        // No code in URL — nothing to exchange, go back to login
        navigate("/auth", { replace: true });
        return;
      }

      try {
        // Explicitly exchange the PKCE code for a session.
        // We do this directly rather than relying on detectSessionInUrl
        // so there is no timing ambiguity with onAuthStateChange.
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
        navigate("/matches", { replace: true });
      } catch (err: any) {
        console.error("[AuthCallback] exchange failed:", err);
        // Fallback: detectSessionInUrl may have already exchanged the code
        // and stored the session — if so, just proceed.
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          navigate("/matches", { replace: true });
          return;
        }
        setErrorMsg(err?.message ?? "Sign-in failed");
        setTimeout(() => navigate("/auth", { replace: true }), 3000);
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{
      background: "#0f0f0f",
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        {!errorMsg ? (
          <>
            <div style={{
              width: 40, height: 40,
              border: "2px solid white",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "xplay-spin 0.9s linear infinite",
            }} />
            <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, margin: 0 }}>Signing you in…</p>
          </>
        ) : (
          <p style={{ color: "#f87171", fontSize: 14, margin: 0 }}>{errorMsg} — redirecting…</p>
        )}
      </div>
      <style>{`@keyframes xplay-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default AuthCallback;
