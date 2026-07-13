import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, MapPin, Building2, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

type Club = {
  id: string;
  club_name: string;
  location: string;
  city: string | null;
  source?: string; // 'xplay_partner' | 'directory'
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (club: Club) => void;
  /** Optional escape hatch: "Can't find your club?" → free venue search (Google Places). */
  onOther?: () => void;
}

const ClubPicker = ({ open, onOpenChange, onSelect, onOther }: Props) => {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("clubs")
        .select("id, club_name, location, city, source")
        .eq("club_status", "active")
        .order("source", { ascending: false }) // xplay_partner before directory
        .order("club_name");
      if (data) setClubs(data);
      setLoading(false);
    };
    fetch();
  }, [open]);

  const filtered = clubs.filter((c) => {
    const matchSearch =
      c.club_name.toLowerCase().includes(search.toLowerCase()) ||
      c.location.toLowerCase().includes(search.toLowerCase()) ||
      (c.city ?? "").toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  const handleOther = () => {
    onOpenChange(false);
    onOther?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg h-[75vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-4 pb-3 border-b border-border/30">
          <DialogTitle className="font-display flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" /> Select Venue
          </DialogTitle>
        </DialogHeader>

        {/* Search & Filters */}
        <div className="p-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or location..."
              className="pl-9 h-10 rounded-xl bg-muted border-border/50"
              style={{ fontSize: "16px" }}
            />
          </div>
        </div>

        {/* Club List */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No clubs found</p>
            </div>
          ) : (
            <AnimatePresence>
              {filtered.map((club) => (
                <motion.button
                  key={club.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  onClick={() => { onSelect(club); onOpenChange(false); }}
                  className="w-full text-left p-3 rounded-xl bg-muted/50 hover:bg-muted border border-border/30 hover:border-primary/30 transition-colors flex items-center gap-3 group"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-sm truncate">{club.club_name}</p>
                      {club.source === "xplay_partner" && (
                        <span className="text-[10px] font-black uppercase tracking-wider text-primary-foreground bg-primary rounded-full px-1.5 py-px flex-shrink-0">
                          XPLAY
                        </span>
                      )}
                      {club.source === "directory" && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground border border-border rounded-full px-1.5 py-px flex-shrink-0">
                          External booking
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3" /> {club.location || club.city || "—"}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                </motion.button>
              ))}
            </AnimatePresence>
          )}

          {/* Escape hatch — venue not in the directory */}
          {!loading && onOther && (
            <button
              onClick={handleOther}
              className="w-full text-left p-3 rounded-xl border border-dashed border-border/60 hover:border-primary/40 transition-colors flex items-center gap-3 group"
            >
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                <MapPin className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">Can't find your club?</p>
                <span className="text-xs text-muted-foreground">
                  Search any venue or address
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ClubPicker;
