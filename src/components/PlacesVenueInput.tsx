/**
 * PlacesVenueInput
 *
 * Venue search with a custom dropdown — uses AutocompleteService directly so
 * tapping a suggestion works reliably on iOS Capacitor and inside Radix dialogs.
 * No .pac-container, no focus-trap fights.
 */

import { useCallback, useRef, useState } from "react";
import { MapPin, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGooglePlaces, type PlaceResult, type Prediction } from "@/hooks/useGooglePlaces";

interface PlacesVenueInputProps {
  value: PlaceResult | null;
  onChange: (place: PlaceResult | null) => void;
  hasError?: boolean;
  className?: string;
}

const PlacesVenueInput = ({ value, onChange, hasError, className }: PlacesVenueInputProps) => {
  const [inputText, setInputText] = useState(value?.name ?? "");
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback(
    (place: PlaceResult) => {
      onChange(place);
      setInputText(place.name);
      setShowDropdown(false);
    },
    [onChange]
  );

  const { ready, failed, predictions, fetchPredictions, selectPrediction, clearPredictions } =
    useGooglePlaces(handleSelect);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputText(val);
    if (value) onChange(null); // clear resolved place when user retypes

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!val.trim()) {
      clearPredictions();
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      fetchPredictions(val);
      setShowDropdown(true);
    }, 250);
  };

  const handleClear = () => {
    onChange(null);
    setInputText("");
    clearPredictions();
    setShowDropdown(false);
  };

  const handlePredictionSelect = (pred: Prediction) => {
    // Update input immediately so user sees the selection right away
    setInputText(pred.mainText);
    setShowDropdown(false);
    selectPrediction(pred); // fetches full details + calls onChange
  };

  // Fallback: plain text when Google Maps script fails/no key
  if (failed) {
    return (
      <div className={cn("relative", className)}>
        <div className="relative flex items-center">
          <MapPin className="absolute left-3 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={inputText}
            onChange={(e) => {
              const val = e.target.value;
              setInputText(val);
              onChange(val.trim() ? { name: val.trim(), address: "" } : null);
            }}
            placeholder="Enter venue name or address..."
            className={cn(
              "w-full h-12 rounded-xl bg-muted border pl-9 pr-9 transition-colors outline-none",
              "focus:border-primary/60 focus:ring-1 focus:ring-primary/20",
              hasError
                ? "border-destructive ring-1 ring-destructive/30"
                : "border-border/50 hover:border-primary/40"
            )}
            style={{ fontSize: "16px" }}
          />
          {inputText && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-3 p-0.5 rounded-full text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Input */}
      <div className="relative flex items-center">
        <MapPin className="absolute left-3 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={inputText}
          onChange={handleInputChange}
          onFocus={() => { if (predictions.length > 0) setShowDropdown(true); }}
          onBlur={() => {
            // Delay hiding so tap on dropdown row registers first
            setTimeout(() => setShowDropdown(false), 200);
          }}
          placeholder={ready ? "Search venue or address..." : "Loading..."}
          disabled={!ready}
          autoComplete="off"
          className={cn(
            "w-full h-12 rounded-xl bg-muted border pl-9 pr-9 text-sm transition-colors outline-none",
            "focus:border-primary/60 focus:ring-1 focus:ring-primary/20",
            hasError
              ? "border-destructive ring-1 ring-destructive/30"
              : "border-border/50 hover:border-primary/40",
            !ready && "opacity-60 cursor-not-allowed"
          )}
          style={{ fontSize: "16px" }}
        />
        {(value || inputText) && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()} // keep focus on input
            onClick={handleClear}
            className="absolute right-3 p-0.5 rounded-full text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Resolved address label */}
      {value?.address && !showDropdown && (
        <p className="text-[10px] text-muted-foreground mt-1 px-1 truncate">{value.address}</p>
      )}

      {/* Custom dropdown — replaces .pac-container */}
      {showDropdown && predictions.length > 0 && (
        <div
          className="absolute z-[9999] left-0 right-0 mt-1 rounded-xl border border-border/60 bg-popover shadow-xl overflow-hidden"
          // Prevent blur from hiding dropdown before tap registers
          onMouseDown={(e) => e.preventDefault()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          {predictions.map((pred, i) => (
            <button
              key={pred.placeId}
              type="button"
              className={cn(
                "w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/60 active:bg-muted transition-colors",
                i > 0 && "border-t border-border/30"
              )}
              onMouseDown={(e) => {
                e.preventDefault(); // prevent input blur
                handlePredictionSelect(pred);
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                handlePredictionSelect(pred);
              }}
            >
              <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{pred.mainText}</p>
                {pred.secondaryText && (
                  <p className="text-xs text-muted-foreground truncate">{pred.secondaryText}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default PlacesVenueInput;
