import { useState } from "react";
import { Search, SlidersHorizontal, X, Calendar, Clock, MapPin, Sun, CloudRain } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export interface MatchFilters {
  search: string;
  date: Date | undefined;
  time: string;
  club: string;
  courtType: string;
  levelRange: [number, number];
}

const defaultFilters: MatchFilters = {
  search: "",
  date: undefined,
  time: "",
  club: "",
  courtType: "",
  levelRange: [0.5, 7.0],
};

interface SearchFilterBarProps {
  filters: MatchFilters;
  onFiltersChange: (filters: MatchFilters) => void;
}

const timeSlots = [
  { value: "morning", label: "Morning (6–12)" },
  { value: "afternoon", label: "Afternoon (12–18)" },
  { value: "evening", label: "Evening (18–23)" },
];

const clubs = [
  "All Clubs",
  "Club Padel Barcelona",
  "Padel Indoor Madrid",
  "Valencia Padel Center",
  "Sevilla Padel Club",
];

const SearchFilterBar = ({ filters, onFiltersChange }: SearchFilterBarProps) => {
  const [showFilters, setShowFilters] = useState(false);

  const activeFilterCount = [
    filters.date,
    filters.time,
    filters.club,
    filters.courtType,
    filters.levelRange[0] !== 0.5 || filters.levelRange[1] !== 7.0,
  ].filter(Boolean).length;

  const updateFilter = <K extends keyof MatchFilters>(key: K, value: MatchFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearFilters = () => onFiltersChange(defaultFilters);

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => updateFilter("search", e.target.value)}
            placeholder="Search matches, clubs, players..."
            className="pl-10 h-11 rounded-xl bg-muted border-border/50"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          className={cn(
            "h-11 w-11 rounded-xl border-border/50 shrink-0",
            showFilters && "bg-primary text-primary-foreground border-primary"
          )}
          onClick={() => setShowFilters(!showFilters)}
        >
          <SlidersHorizontal className="w-4 h-4" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>

      {/* Filter panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="card-elevated p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Filters</span>
                {activeFilterCount > 0 && (
                  <button onClick={clearFilters} className="text-xs text-primary font-medium flex items-center gap-1">
                    <X className="w-3 h-3" /> Clear all
                  </button>
                )}
              </div>

              {/* Date */}
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" /> Date
                </label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full h-10 rounded-xl justify-start text-left font-normal bg-muted border-border/50",
                        !filters.date && "text-muted-foreground"
                      )}
                    >
                      {filters.date ? format(filters.date, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={filters.date}
                      onSelect={(d) => updateFilter("date", d)}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Time + Court Type row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground font-medium mb-1.5 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> Time
                  </label>
                  <Select value={filters.time} onValueChange={(v) => updateFilter("time", v)}>
                    <SelectTrigger className="h-10 rounded-xl bg-muted border-border/50">
                      <SelectValue placeholder="Any time" />
                    </SelectTrigger>
                    <SelectContent>
                      {timeSlots.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium mb-1.5 flex items-center gap-1.5">
                    <Sun className="w-3.5 h-3.5" /> Court Type
                  </label>
                  <Select value={filters.courtType} onValueChange={(v) => updateFilter("courtType", v)}>
                    <SelectTrigger className="h-10 rounded-xl bg-muted border-border/50">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="indoor">Indoor</SelectItem>
                      <SelectItem value="outdoor">Outdoor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Club */}
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1.5 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" /> Club
                </label>
                <Select value={filters.club} onValueChange={(v) => updateFilter("club", v)}>
                  <SelectTrigger className="h-10 rounded-xl bg-muted border-border/50">
                    <SelectValue placeholder="All clubs" />
                  </SelectTrigger>
                  <SelectContent>
                    {clubs.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Level range */}
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-2 flex items-center justify-between">
                  <span>Level Range</span>
                  <span className="text-foreground font-semibold">{filters.levelRange[0].toFixed(1)} – {filters.levelRange[1].toFixed(1)}</span>
                </label>
                <Slider
                  value={filters.levelRange}
                  onValueChange={(v) => updateFilter("levelRange", v as [number, number])}
                  min={0.5}
                  max={7.0}
                  step={0.5}
                  className="py-1"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>Beginner</span>
                  <span>Pro</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SearchFilterBar;
export { defaultFilters };
