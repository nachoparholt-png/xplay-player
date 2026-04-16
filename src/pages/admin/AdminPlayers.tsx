import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { Enums } from "@/integrations/supabase/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format } from "date-fns";

type PlayerRow = {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  location: string | null;
  padel_level: number | null;
  padel_park_points: number;
  total_matches: number;
  account_status: string;
  phone: string | null;
  created_at: string;
  last_active_at: string | null;
  email?: string;
  active_stakes?: number;
};

const PAGE_SIZE = 20;

const statusColors: Record<string, string> = {
  active: "bg-win/10 text-win",
  inactive: "bg-muted text-muted-foreground",
  suspended: "bg-gold/10 text-gold",
  blocked: "bg-destructive/10 text-destructive",
  pending_verification: "bg-primary/10 text-primary",
};

const AdminPlayers = () => {
  const navigate = useNavigate();
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [sortCol, setSortCol] = useState<string>("created_at");
  const [sortAsc, setSortAsc] = useState(false);

  const fetchPlayers = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from("profiles")
      .select("*", { count: "exact" })
      .order(sortCol, { ascending: sortAsc })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (search) {
      query = query.or(`display_name.ilike.%${search}%,location.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    if (statusFilter !== "all") {
      query = query.eq("account_status", statusFilter as Enums<"account_status">);
    }

    const { data, count } = await query;

    // Fetch active stakes counts
    if (data && data.length > 0) {
      const userIds = data.map((p) => p.user_id);
      const { data: stakeCounts } = await supabase
        .from("match_stakes")
        .select("user_id")
        .in("user_id", userIds)
        .eq("status", "active");

      const stakeMap = new Map<string, number>();
      (stakeCounts || []).forEach((s) => {
        stakeMap.set(s.user_id, (stakeMap.get(s.user_id) || 0) + 1);
      });

      setPlayers(
        data.map((p) => ({
          ...p,
          active_stakes: stakeMap.get(p.user_id) || 0,
        }))
      );
    } else {
      setPlayers([]);
    }

    setTotal(count || 0);
    setLoading(false);
  }, [search, statusFilter, page, sortCol, sortAsc]);

  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers]);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(true);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const SortHeader = ({ col, label, className }: { col: string; label: string; className?: string }) => (
    <th
      className={`text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-3 px-3 cursor-pointer hover:text-foreground transition-colors ${className || ""}`}
      onClick={() => handleSort(col)}
    >
      {label}
      {sortCol === col && <span className="ml-1">{sortAsc ? "↑" : "↓"}</span>}
    </th>
  );

  return (
    <div className="px-4 lg:px-8 py-6 lg:pt-8 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Players</h1>
          <p className="text-sm text-muted-foreground">{total} registered players</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search name, location, phone..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-10 rounded-xl"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[180px] rounded-xl">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
            <SelectItem value="pending_verification">Pending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-destructive border-t-transparent rounded-full animate-spin" />
        </div>
      ) : players.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <Users className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">No players found</p>
        </div>
      ) : (
        <div className="card-elevated overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border/50">
                <tr>
                  <SortHeader col="display_name" label="Player" />
                  <SortHeader col="padel_level" label="Level" />
                  <SortHeader col="padel_park_points" label="Points" />
                  <SortHeader col="total_matches" label="Matches" />
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-3 px-3">Stakes</th>
                  <SortHeader col="account_status" label="Status" />
                  <SortHeader col="created_at" label="Joined" />
                  <SortHeader col="last_active_at" label="Last Active" className="hidden lg:table-cell" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {players.map((player, i) => (
                  <motion.tr
                    key={player.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => navigate(`/admin/players/${player.user_id}`)}
                  >
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-8 h-8">
                          <AvatarImage src={player.avatar_url || ""} />
                          <AvatarFallback className="text-xs font-bold bg-muted">
                            {player.display_name?.[0]?.toUpperCase() || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold text-sm">{player.display_name || "No name"}</p>
                          <p className="text-xs text-muted-foreground">{player.location || "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-sm font-medium">
                      {player.padel_level != null ? player.padel_level.toFixed(1) : "—"}
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-sm font-bold text-primary">{player.padel_park_points}</span>
                    </td>
                    <td className="py-3 px-3 text-sm">{player.total_matches}</td>
                    <td className="py-3 px-3 text-sm">{player.active_stakes || 0}</td>
                    <td className="py-3 px-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${statusColors[player.account_status] || ""}`}>
                        {player.account_status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-xs text-muted-foreground">
                      {format(new Date(player.created_at), "MMM d, yyyy")}
                    </td>
                    <td className="py-3 px-3 text-xs text-muted-foreground hidden lg:table-cell">
                      {player.last_active_at ? format(new Date(player.last_active_at), "MMM d, HH:mm") : "—"}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/30">
              <p className="text-xs text-muted-foreground">
                Page {page + 1} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                  className="rounded-lg"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(page + 1)}
                  className="rounded-lg"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminPlayers;
