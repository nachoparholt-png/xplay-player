import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .single();
    setProfile(data);
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
  };

  useEffect(() => {
    // Set up the auth state listener FIRST, then get initial session.
    // onAuthStateChange emits INITIAL_SESSION on subscribe, which handles
    // both cached sessions AND post-OAuth redirect token processing.
    let initialSessionHandled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          // Use setTimeout to avoid Supabase deadlock
          setTimeout(() => fetchProfile(session.user.id), 0);

          // Process pending referral on first sign-in
          if (event === 'SIGNED_IN') {
            const pendingRef = localStorage.getItem("xplay_pending_ref");
            if (pendingRef) {
              localStorage.removeItem("xplay_pending_ref");
              supabase.functions.invoke("process-referral", {
                body: { referral_code: pendingRef },
              }).catch(() => {});
            }
          }
        } else {
          setProfile(null);
        }
        // Only set loading false after we've handled at least the initial event
        if (event === 'INITIAL_SESSION' || !initialSessionHandled) {
          initialSessionHandled = true;
          setLoading(false);
        } else {
          setLoading(false);
        }
      }
    );

    // Fallback: if INITIAL_SESSION doesn't fire within 2s, force loading off
    const timeout = setTimeout(() => {
      if (!initialSessionHandled) {
        initialSessionHandled = true;
        supabase.auth.getSession().then(({ data: { session } }) => {
          setSession(session);
          setUser(session?.user ?? null);
          if (session?.user) {
            fetchProfile(session.user.id);
          }
          setLoading(false);
        });
      }
    }, 2000);

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  // Handle deep-link callbacks on iOS (e.g. after email confirmation or Google OAuth)
  // PKCE flow: xplay://auth/callback?code=XXXXX
  // Implicit fallback: xplay://auth/callback#access_token=...&refresh_token=...
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handleDeepLink = async ({ url }: { url: string }) => {
      if (!url.startsWith("xplay://")) return;

      // Close in-app browser if it was opened for OAuth
      await Browser.close().catch(() => {});

      // Parse the URL
      const normalized = url.replace("xplay://", "https://x.app/");
      const parsed = new URL(normalized);
      const hash = new URLSearchParams(parsed.hash.replace("#", ""));
      const query = new URLSearchParams(parsed.search);

      // PKCE flow: exchange the short-lived code for a session
      const code = query.get("code") ?? hash.get("code");
      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
        const ref = query.get("ref") ?? hash.get("ref");
        if (ref) localStorage.setItem("xplay_pending_ref", ref);
        return;
      }

      // Implicit flow fallback (magic links, email confirmations)
      const accessToken = hash.get("access_token") ?? query.get("access_token");
      const refreshToken = hash.get("refresh_token") ?? query.get("refresh_token");
      if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      }

      // Preserve referral code from deep link: xplay://?ref=CODE
      const ref = hash.get("ref") ?? query.get("ref");
      if (ref) localStorage.setItem("xplay_pending_ref", ref);
    };

    App.addListener("appUrlOpen", handleDeepLink);
    return () => { App.removeAllListeners(); };
  }, []);

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
