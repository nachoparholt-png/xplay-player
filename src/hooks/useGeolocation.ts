import { useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type GeoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; lat: number; lng: number }
  | { status: "denied" }
  | { status: "error"; message: string };

/**
 * Requests the device's current position.
 * • On Capacitor (iOS / Android): uses @capacitor/geolocation — triggers
 *   the native OS permission prompt.
 * • On web: falls back to navigator.geolocation.
 *
 * When a position is obtained, lat/lng are saved to the logged-in
 * user's profile row (last_lat, last_lng, last_location_at) so the
 * club app can use proximity data for targeted promotions.
 */
export function useGeolocation() {
  const { user } = useAuth();
  const [geo, setGeo] = useState<GeoState>({ status: "idle" });

  const requestLocation = useCallback(async () => {
    setGeo({ status: "loading" });

    try {
      let lat: number;
      let lng: number;

      if (Capacitor.isNativePlatform()) {
        // ── Native iOS / Android ──────────────────────────────────
        // Check / request permission first so we can surface a friendly
        // message if the user has denied it.
        const perm = await Geolocation.checkPermissions();
        if (perm.location === "denied") {
          setGeo({ status: "denied" });
          return;
        }
        if (perm.location !== "granted") {
          const req = await Geolocation.requestPermissions();
          if (req.location !== "granted") {
            setGeo({ status: "denied" });
            return;
          }
        }
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10000,
        });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } else {
        // ── Web browser ───────────────────────────────────────────
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          if (!navigator.geolocation) {
            reject(new Error("Geolocation not supported"));
            return;
          }
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
          });
        });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      }

      setGeo({ status: "ok", lat, lng });

      // Persist to profile so club app can use for proximity promotions
      if (user) {
        await supabase
          .from("profiles")
          .update({
            last_lat: lat,
            last_lng: lng,
            last_location_at: new Date().toISOString(),
          })
          .eq("user_id", user.id);
      }
    } catch (err: any) {
      const msg: string = err?.message ?? String(err);
      if (
        msg.includes("denied") ||
        msg.includes("PERMISSION_DENIED") ||
        err?.code === 1
      ) {
        setGeo({ status: "denied" });
      } else {
        setGeo({ status: "error", message: msg });
      }
    }
  }, [user]);

  const clearLocation = useCallback(() => {
    setGeo({ status: "idle" });
  }, []);

  return { geo, requestLocation, clearLocation };
}
