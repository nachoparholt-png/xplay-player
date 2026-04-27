import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Registers for iOS/Android push notifications, saves the device token to
 * `profiles.push_token`, and handles notification taps by navigating in-app.
 *
 * Must be called inside a component that has access to AuthContext and Router.
 */
export function usePushNotifications() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Only run on native platforms (iOS / Android)
    if (!Capacitor.isNativePlatform() || !user) return;

    let mounted = true;

    const setup = async () => {
      try {
        const { receive } = await PushNotifications.requestPermissions();
        if (receive !== "granted") return;

        await PushNotifications.register();

        // Save device token to Supabase so edge functions can send targeted pushes
        const regListener = await PushNotifications.addListener("registration", async (token) => {
          if (!mounted) return;
          await supabase
            .from("profiles")
            .update({ push_token: token.value })
            .eq("user_id", user.id);
        });

        const errListener = await PushNotifications.addListener("registrationError", (err) => {
          console.error("[PushNotifications] Registration error:", err.error);
        });

        // Handle taps on push notifications — navigate to the relevant page
        const actionListener = await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          (action) => {
            if (!mounted) return;
            const data = action.notification.data as Record<string, string> | undefined;
            const type = data?.type;
            // match_id may come as an explicit field, or we extract it from the link/route
            const route = data?.route ?? data?.link ?? "";
            const matchIdFromRoute = route.match(/\/matches\/([a-f0-9-]{36})/)?.[1];
            const matchId = data?.match_id ?? matchIdFromRoute ?? null;

            // Type-aware routing for match lifecycle notifications
            if (type === "match_auto_cancelled") {
              // Match was cancelled — go to the matches list so they can find another
              navigate("/matches");
            } else if (type === "match_deadline_warning" && matchId) {
              // Organiser warned about deadline — take them to the specific match to share/promote
              navigate(`/matches/${matchId}`);
            } else if (type === "match_reminder" && matchId) {
              // Pre-match reminder — deep link to match detail
              navigate(`/matches/${matchId}`);
            } else if (route) {
              // Legacy / generic fallback: use explicit route from payload
              navigate(route);
            } else {
              navigate("/matches");
            }
          }
        );

        return () => {
          mounted = false;
          regListener.remove();
          errListener.remove();
          actionListener.remove();
        };
      } catch (err) {
        console.error("[PushNotifications] Setup error:", err);
      }
    };

    const cleanup = setup();
    return () => {
      mounted = false;
      cleanup.then((fn) => fn?.());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
}
