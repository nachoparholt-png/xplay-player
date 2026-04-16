import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Trophy, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import type { TournamentFormat, TournamentVisibility } from "@/lib/tournaments/types";

const TournamentCreate = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<TournamentVisibility>("public");
  const [formatType, setFormatType] = useState<TournamentFormat>("groups");
  const [tournamentType, setTournamentType] = useState("pairs");
  const [playerCount, setPlayerCount] = useState("8");
  const [courtCount, setCourtCount] = useState("2");

  const handleCreate = async () => {
    if (!user || !name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    setSaving(true);

    const { data, error } = await supabase.from("tournaments").insert({
      created_by: user.id,
      name: name.trim(),
      visibility,
      format_type: formatType,
      tournament_type: tournamentType,
      player_count: parseInt(playerCount),
      court_count: parseInt(courtCount),
    }).select("id").single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    // Auto-join creator
    if (data?.id) {
      await supabase.from("tournament_players").insert({
        tournament_id: data.id,
        user_id: user.id,
      });

      toast({ title: "Tournament created! 🏆" });
      navigate(`/tournaments/${data.id}`);
    }
  };

  const isDesktop = typeof window !== "undefined" && window.innerWidth >= 768;

  return (
    <div className="px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/tournaments")} className="rounded-xl">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-display font-bold flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" />
          Create Tournament
        </h1>
      </div>

      {isDesktop && (
        <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
          <Monitor className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-[12px] text-amber-300 leading-relaxed">
            <span className="font-semibold">Best on mobile.</span> The tournament builder is optimised for the XPLAY app. For the best experience, open it on your phone.
          </p>
        </div>
      )}

      <div className="space-y-5">
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Tournament Name</Label>
          <Input
            placeholder="e.g. Sunday Showdown"
            value={name}
            onChange={e => setName(e.target.value)}
            className="rounded-xl h-11"
          />
        </div>

        <div className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-card">
          <div>
            <p className="text-sm font-semibold">Private Tournament</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {visibility === "private" ? "Invite-only, hidden from browse" : "Visible to all, anyone can join"}
            </p>
          </div>
          <Switch
            checked={visibility === "private"}
            onCheckedChange={v => setVisibility(v ? "private" : "public")}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold">Type</Label>
          <Select value={tournamentType} onValueChange={setTournamentType}>
            <SelectTrigger className="rounded-xl h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pairs">Pairs (2v2)</SelectItem>
              <SelectItem value="individual">Individual</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold">Format</Label>
          <Select value={formatType} onValueChange={v => setFormatType(v as TournamentFormat)}>
            <SelectTrigger className="rounded-xl h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="groups">Groups + Knockout</SelectItem>
              <SelectItem value="americano">Americano</SelectItem>
              <SelectItem value="king_of_court">King of the Court</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Players</Label>
            <Select value={playerCount} onValueChange={setPlayerCount}>
              <SelectTrigger className="rounded-xl h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[4, 6, 8, 10, 12, 16, 20, 24].map(n => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Courts</Label>
            <Select value={courtCount} onValueChange={setCourtCount}>
              <SelectTrigger className="rounded-xl h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6].map(n => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button
          onClick={handleCreate}
          disabled={saving || !name.trim()}
          className="w-full rounded-xl h-12 font-semibold text-base"
        >
          {saving ? "Creating..." : "Create Tournament"}
        </Button>
      </div>
    </div>
  );
};

export default TournamentCreate;
