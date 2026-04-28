/**
 * useGooglePlaces
 *
 * Uses the Google Places AutocompleteService + PlacesService (not the DOM widget)
 * so the dropdown is fully under our control — no .pac-container focus-trap issues
 * inside Radix dialogs, no broken tap-to-select on iOS Capacitor.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

// ── Singleton script loader ───────────────────────────────────────────────────
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

  setTimeout(() => {
    if (scriptState === "loading") {
      scriptState = "error";
      errorCallbacks.forEach((fn) => fn());
      errorCallbacks.length = 0;
    }
  }, 8000);
}

// ── Types ─────────────────────────────────────────────────────────────────────
export type PlaceResult = {
  name: string;
  address: string;
};

export type Prediction = {
  placeId: string;
  mainText: string;
  secondaryText: string;
};

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useGooglePlaces(onSelect: (place: PlaceResult) => void) {
  const noKey = !GOOGLE_MAPS_KEY;
  const [ready, setReady] = useState(!noKey && scriptState === "ready");
  const [failed, setFailed] = useState(noKey || scriptState === "error");
  const [predictions, setPredictions] = useState<Prediction[]>([]);

  const acServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  // PlacesService needs a DOM attribution node
  const attrDivRef = useRef<HTMLDivElement | null>(null);

  // Load Google Maps script
  useEffect(() => {
    if (noKey) return;
    loadScript(() => setReady(true), () => setFailed(true));
  }, [noKey]);

  // Initialise services once script is ready
  useEffect(() => {
    if (!ready) return;
    if (!acServiceRef.current) {
      acServiceRef.current = new window.google.maps.places.AutocompleteService();
    }
    if (!placesServiceRef.current) {
      if (!attrDivRef.current) {
        attrDivRef.current = document.createElement("div");
        document.body.appendChild(attrDivRef.current);
      }
      placesServiceRef.current = new window.google.maps.places.PlacesService(attrDivRef.current);
    }
  }, [ready]);

  // Fetch predictions for a text query
  const fetchPredictions = useCallback((input: string) => {
    if (!acServiceRef.current || !input.trim()) {
      setPredictions([]);
      return;
    }
    acServiceRef.current.getPlacePredictions(
      { input, types: ["establishment", "geocode"] },
      (preds, status) => {
        if (
          status === window.google.maps.places.PlacesServiceStatus.OK &&
          preds && preds.length > 0
        ) {
          setPredictions(
            preds.slice(0, 5).map((p) => ({
              placeId: p.place_id,
              mainText: p.structured_formatting.main_text,
              secondaryText: p.structured_formatting.secondary_text ?? "",
            }))
          );
        } else {
          setPredictions([]);
        }
      }
    );
  }, []);

  // Resolve a prediction to a full PlaceResult and call onSelect
  const selectPrediction = useCallback(
    (prediction: Prediction) => {
      if (!placesServiceRef.current) return;
      setPredictions([]); // close dropdown immediately
      placesServiceRef.current.getDetails(
        { placeId: prediction.placeId, fields: ["name", "formatted_address"] },
        (place, status) => {
          if (
            status === window.google.maps.places.PlacesServiceStatus.OK &&
            place
          ) {
            onSelect({
              name: place.name ?? prediction.mainText,
              address: place.formatted_address ?? prediction.secondaryText,
            });
          } else {
            // Fallback: use the prediction text directly
            onSelect({ name: prediction.mainText, address: prediction.secondaryText });
          }
        }
      );
    },
    [onSelect]
  );

  const clearPredictions = useCallback(() => setPredictions([]), []);

  return { ready, failed, predictions, fetchPredictions, selectPrediction, clearPredictions };
}
