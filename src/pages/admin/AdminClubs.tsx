import { useState, useEffect } from "react";
import { Building2, Search, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Club = {
  id: string;
  club_name: string;
  approximate_location: string;
  city: string;
  region: string;
  country: string;
  number_of_courts: number;
  main_court_type: string;
  typical_active_hours: string;
  club_status: string;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  club_description: string | null;
  address_line_1: string;
  postcode: string;
  latitude: number | null;
  longitude: number | null;
  amenities: string | null;
  operating_hours: string | null;
  parking_info: string | null;
  notes_for_admin: string | null;
  created_at: string;
  updated_at: string;
};

const AdminClubs = () => {
  const { toast } = useToast();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [courtTypeFilter, setCourtTypeFilter] = useState<string>("all");

  const fetchClubs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("clubs")
      .select("*")
      .order("club_name");

    if (data) setClubs(data);
    if (error) toast({ title: "Error loading clubs", description: error.message, variant: "destructive" });
    setLoading(false);
  };

  useEffect(() => { fetchClubs(); }, []);

  const filtered = clubs.filter((c) => {
    const matchesSearch =
      c.club_name.toLowerCase().includes(search.toLowerCase()) ||
      c.approximate_location.toLowerCase().includes(search.toLowerCase()) ||
      c.city.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.club_status === statusFilter;
    const matchesCourt = courtTypeFilter === "all" || c.main_court_type === courtTypeFilter;
    return matchesSearch && matchesStatus && matchesCourt;
  });

  if (loading) {
    return (
      <div className="px-4 py-6 pt-16 lg:pt-6 flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-2 border-destructive border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 pt-16 lg:pt-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="w-6 h-6 text-destructive" />
          <h1 className="text-2xl font-display font-bold">Clubs</h1>
          <Badge variant="secondary" className="text-xs">{clubs.length}</Badge>
        </div>
      </div>

      {/* Read-only info banner */}
      <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <p>This is a read-only view of club data. Club details, courts, pricing and operating hours are managed in the <span className="font-medium text-foreground">Club Management App</span>.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clubs..."
            className="pl-9 h-10 rounded-xl bg-muted border-border/50"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-10 rounded-xl bg-muted border-border/50">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={courtTypeFilter} onValueChange={setCourtTypeFilter}>
          <SelectTrigger className="w-[140px] h-10 rounded-xl bg-muted border-border/50">
            <SelectValue placeholder="Court Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="indoor">Indoor</SelectItem>
            <SelectItem value="outdoor">Outdoor</SelectItem>
            <SelectItem value="mixed">Mixed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="card-elevated p-10 text-center text-muted-foreground">
          <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No clubs found</p>
          <p className="text-sm mt-1">No clubs match your current filters.</p>
        </div>
      ) : (
        <div className="card-elevated overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-muted/50">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Club / Venue</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden md:table-cell">Approx. Location</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Courts</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden sm:table-cell">Type</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell">Active Hours</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((club) => (
                  <tr key={club.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{club.club_name}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{club.approximate_location}</td>
                    <td className="px-4 py-3 text-center">{club.number_of_courts}</td>
                    <td className="px-4 py-3 text-center capitalize hidden sm:table-cell">{club.main_court_type}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground hidden lg:table-cell">{club.typical_active_hours}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={club.club_status === "active" ? "default" : "secondary"} className="text-[10px]">
                        {club.club_status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminClubs;
