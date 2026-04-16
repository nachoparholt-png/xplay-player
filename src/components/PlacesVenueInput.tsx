import { useRef, useState } from "react";
import { MapPin, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGooglePlaces, type PlaceResult } from "@/hooks/useGooglePlaces";

interface PlacesVenueInputProps {
  value: PlaceResult | null;
  onChange: (place: PlaceResult | null) => void;
  hasError?: boolean;
  className?: string;
}

const PlacesVenueInput = ({ value, onChange, hasError, className }: PlacesVenueInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputText, setInputText] = useState(value?.name ?? "");

  const { ready, failed } = useGooglePlaces(inputRef, (place) => {
    onChange(place);
    setInputText(place.name);
  });

  const handleClear = () => {
    onChange(null);
    setInputText("");
    if (inputRef.current) inputRef.current.value = "";
    inputRef.current?.focus();
  };

  // Fallback: plain text input when Google Places script fails to load
  // (e.g. API key doesn't allow capacitor://localhost origin, or no internet)
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
              // Emit a PlaceResult-shaped object so the parent gets a value
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
              onClick={() => { setInputText(""); onChange(null); }}
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
    <div className={cn("relative", className)}>
      <div className="relative flex items-center">
        <MapPin className="absolute left-3 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            // If user types after selection, clear the resolved place
            if (value) onChange(null);
          }}
          placeholder={ready ? "Search venue or address..." : "Loading..."}
          disabled={!ready}
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
            onClick={handleClear}
            className="absolute right-3 p-0.5 rounded-full text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {value?.address && (
        <p className="text-[10px] text-muted-foreground mt-1 px-1 truncate">
          {value.address}
        </p>
      )}
    </div>
  );
};

export default PlacesVenueInput;
