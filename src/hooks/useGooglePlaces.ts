import { useEffect, useRef, useState } from "react";

const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

// Singleton script loader — only loads once per page session
let scriptState: "idle" | "loading" | "ready" | "error" = "idle";
const readyCallbacks: Array<() => void> = [];
const errorCallbacks: Array<() => void> = [];

function loadScript(onReady: () => void, onError: () => void) {
  if (scriptState === "ready") { onReady(); return; }
  if (scriptState === "error") { onError(); return; }
  readyCallbacks.push(onReady);
  errorCallbacks.push(onError);
  if (scriptState === "loading") return;
  scriptState = "loading";

  (window as unknown as Record<string, unknown>)["__gmapsReady"] = () => {
    scriptState = "ready";
    readyCallbacks.forEach((fn) => fn());
    readyCallbacks.length = 0;
  };

  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&libraries=places&callback=__gmapsReady`;
  script.async = true;
  script.onerror = () => {
    scriptState = "error";
    errorCallbacks.forEach((fn) => fn());
    errorCallbacks.length = 0;
  };
  document.head.appendChild(script);

  // Timeout fallback — if script hasn't loaded in 8s, treat as error
  // (handles cases where the script loads but gmap blocks silently, e.g. Capacitor origin)
  setTimeout(() => {
    if (scriptState === "loading") {
      scriptState = "error";
      errorCallbacks.forEach((fn) => fn());
      errorCallbacks.length = 0;
    }
  }, 8000);
}

export type PlaceResult = {
  name: string;       // venue / place name
  address: string;    // formatted address
};

/**
 * Attaches a Google Places Autocomplete to the provided input ref.
 * Returns the currently selected place (or null) and a ready flag.
 */
export function useGooglePlaces(
  inputRef: React.RefObject<HTMLInputElement>,
  onSelect: (place: PlaceResult) => void
) {
  const [ready, setReady] = useState(scriptState === "ready");
  const [failed, setFailed] = useState(scriptState === "error");
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  useEffect(() => {
    loadScript(() => setReady(true), () => setFailed(true));
  }, []);

  useEffect(() => {
    if (!ready || !inputRef.current || autocompleteRef.current) return;

    const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ["establishment", "geocode"],
      fields: ["name", "formatted_address"],
    });

    autocompleteRef.current = ac;

    ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      if (!place) return;
      onSelect({
        name: place.name ?? "",
        address: place.formatted_address ?? "",
      });
    });

    // ── Mobile fix ────────────────────────────────────────────────────────────
    // On iOS WebView (Capacitor), tapping a PAC suggestion fires touchstart on
    // the dropdown item, which blurs the input, collapses the dropdown, and
    // silently swallows the selection — place_changed never fires.
    // Intercepting touchstart at capture phase and calling preventDefault()
    // keeps the input focused so the tap can complete and place_changed fires.
    const handlePacTouch = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.(".pac-container")) {
        e.preventDefault();
      }
    };
    document.addEventListener("touchstart", handlePacTouch, {
      capture: true,
      passive: false,
    });

    return () => {
      window.google.maps.event.clearInstanceListeners(ac);
      autocompleteRef.current = null;
      document.removeEventListener("touchstart", handlePacTouch, {
        capture: true,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, inputRef]);

  return { ready, failed };
}
