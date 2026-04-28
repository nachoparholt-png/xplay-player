import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { motion } from "framer-motion";
import { Upload, Minus, Equal, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const VALID_SCORES = [
  [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [7, 5], [7, 6],
  [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 7], [6, 7],
];

type TeamPlayer = {
  user_id: string;
  display_name: string | null;
  team: string | null;
};

interface ScoreUploadModalProps {
  matchId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  players: TeamPlayer[];
  onSubmitted: () => void;
}

type SetScore = { a: number | null; b: number | null };

const ScoreUploadModal = ({ matchId, open, onOpenChange, players, onSubmitted }: ScoreUploadModalProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [comment, setComment] = useState("");
  const [sets, setSets] = useState<[SetScore, SetScore, SetScore]>([
    { a: null, b: null },
    { a: null, b: null },
    { a: null, b: null },
  ]);

  const teamA = players.filter((p) => p.team === "A");
  const teamB = players.filter((p) => p.team === "B");

  const isValidSet = (s: SetScore): boolean => {
    if (s.a === null || s.b === null) return false;
    return VALID_SCORES.some(([a, b]) => a === s.a && b === s.b);
  };

  const setWinner = (s: SetScore): "a" | "b" | null => {
    if (s.a === null || s.b === null) return null;
    if (s.a > s.b) return "a";
    if (s.b > s.a) return "b";
    return null;
  };

  const set1Valid = isValidSet(sets[0]);
  const set2Valid = isValidSet(sets[1]);
  const set3Valid = sets[2].a !== null && sets[2].b !== null ? isValidSet(sets[2]) : true;

  const setsWonA = [sets[0], sets[1], sets[2]].filter((s) => setWinner(s) === "a").length;
  const setsWonB = [sets[0], sets[1], sets[2]].filter((s) => setWinner(s) === "b").length;

  const resultType: "team_a_win" | "team_b_win" | "draw" | null = (() => {
    if (!set1Valid || !set2Valid) return null;
    if (setsWonA >= 2) return "team_a_win";
    if (setsWonB >= 2) return "team_b_win";
    // If 1-1 and no set 3 or tied set 3
    if (setsWonA === 1 && setsWonB === 1) {
      if (sets[2].a === null && sets[2].b === null) return null; // need set 3
      if (setWinner(sets[2]) === "a") return "team_a_win";
      if (setWinner(sets[2]) === "b") return "team_b_win";
      return "draw";
    }
    return null;
  })();

  const canSubmit = set1Valid && set2Valid && resultType !== null;

  // Derive which team this player is on
  const userTeam = (players.find((p) => p.user_id === user?.id)?.team as "A" | "B") ?? "A";

  const handleSubmitDraw = async () => {
    if (!user) return;
    setSubmitting(true);
    // Submit a draw via the edge function using 0-0 scores
    const { data, error } = await supabase.functions.invoke("submit-match-score", {
      body: {
        match_id: matchId,
        submitted_team: userTeam,
        team_a_set_1: 0,
        team_a_set_2: 0,
        team_b_set_1: 0,
        team_b_set_2: 0,
        team_a_set_3: null,
        team_b_set_3: null,
      },
    });

    if (error || data?.error) {
      toast({ title: "Error", description: data?.error ?? error?.message, variant: "destructive" });
    } else {
      toast({ title: "Draw submitted", description: "Waiting for opponent confirmation." });
      onSubmitted();
      onOpenChange(false);
    }
    setSubmitting(false);
  };

  const handleSubmit = async () => {
    if (!user || !canSubmit) return;
    setSubmitting(true);

    const { data, error } = await supabase.functions.invoke("submit-match-score", {
      body: {
        match_id: matchId,
        submitted_team: userTeam,
        team_a_set_1: sets[0].a,
        team_a_set_2: sets[1].a,
        team_a_set_3: sets[2].a ?? null,
        team_b_set_1: sets[0].b,
        team_b_set_2: sets[1].b,
        team_b_set_3: sets[2].b ?? null,
      },
    });

    if (error || data?.error) {
      toast({ title: "Error submitting score", description: data?.error ?? error?.message, variant: "destructive" });
    } else {
      toast({ title: "Score submitted! ✅", description: "Waiting for the opposing team to review." });
      onSubmitted();
      onOpenChange(false);
    }
    setSubmitting(false);
  };

  const ScoreSelector = ({ value, onChange, label }: { value: number | null; onChange: (v: number) => void; label: string }) => {
    const scores = [0, 1, 2, 3, 4, 5, 6, 7];
    return (
      <div className="flex flex-col items-center gap-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
        <div className="flex flex-wrap gap-1 justify-center">
          {scores.map((s) => (
            <button
              key={s}
              onClick={() => onChange(s)}
              className={`w-9 h-9 rounded-lg font-bold text-sm transition-all ${
                value === s
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const SetRow = ({ index, set, onUpdate }: { index: number; set: SetScore; onUpdate: (s: SetScore) => void }) => {
    const valid = set.a !== null && set.b !== null ? isValidSet(set) : true;
    const winner = setWinner(set);
    return (
      <div className={`p-3 rounded-xl border ${!valid && set.a !== null ? "border-destructive/50 bg-destructive/5" : "border-border/50 bg-card"}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Set {index + 1} {index === 2 ? "(optional)" : ""}
          </span>
          {winner && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              winner === "a" ? "bg-primary/20 text-primary" : "bg-secondary/20 text-secondary"
            }`}>
              {winner === "a" ? "Team A" : "Team B"}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <ScoreSelector label="Team A" value={set.a} onChange={(v) => onUpdate({ ...set, a: v })} />
          <ScoreSelector label="Team B" value={set.b} onChange={(v) => onUpdate({ ...set, b: v })} />
        </div>
        {!valid && set.a !== null && set.b !== null && (
          <p className="text-[10px] text-destructive mt-2 text-center">Invalid set score combination</p>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto bg-card border-border/50 p-0">
        <div className="p-5 pb-0">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" />
              Upload Score
            </DialogTitle>
          </DialogHeader>

          {/* Teams */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
              <p className="text-[10px] uppercase tracking-wider text-primary font-bold mb-2">Team A</p>
              {teamA.map((p) => (
                <div key={p.user_id} className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">
                    {p.display_name?.[0]?.toUpperCase() || "?"}
                  </div>
                  <span className="text-xs truncate">{p.display_name || "Player"}</span>
                </div>
              ))}
            </div>
            <div className="p-3 rounded-xl bg-secondary/5 border border-secondary/20">
              <p className="text-[10px] uppercase tracking-wider text-secondary font-bold mb-2">Team B</p>
              {teamB.map((p) => (
                <div key={p.user_id} className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">
                    {p.display_name?.[0]?.toUpperCase() || "?"}
                  </div>
                  <span className="text-xs truncate">{p.display_name || "Player"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-5 space-y-3">
          {/* Sets */}
          {[0, 1, 2].map((i) => (
            <SetRow
              key={i}
              index={i}
              set={sets[i]}
              onUpdate={(s) => {
                const newSets = [...sets] as [SetScore, SetScore, SetScore];
                newSets[i] = s;
                setSets(newSets);
              }}
            />
          ))}

          {/* Result summary */}
          {resultType && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-center"
            >
              <p className="text-xs text-muted-foreground mb-1">Result</p>
              <p className="font-display font-bold text-lg">
                {resultType === "team_a_win" && (
                  <span className="flex items-center justify-center gap-2">
                    <Trophy className="w-5 h-5 text-primary" /> Team A Wins
                  </span>
                )}
                {resultType === "team_b_win" && (
                  <span className="flex items-center justify-center gap-2">
                    <Trophy className="w-5 h-5 text-secondary" /> Team B Wins
                  </span>
                )}
                {resultType === "draw" && (
                  <span className="flex items-center justify-center gap-2">
                    <Equal className="w-5 h-5 text-gold" /> Draw
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {[sets[0], sets[1], sets[2]]
                  .filter((s) => s.a !== null && s.b !== null)
                  .map((s) => `${s.a}-${s.b}`)
                  .join(" / ")}
              </p>
            </motion.div>
          )}

          {/* Comment */}
          <Textarea
            placeholder="Optional comment..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="rounded-xl bg-muted/50 border-border/50 text-sm resize-none"
            rows={2}
          />

          {/* Actions */}
          <div className="space-y-2">
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="w-full h-12 rounded-xl font-semibold gap-2"
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Submit Score
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleSubmitDraw}
              disabled={submitting}
              className="w-full h-11 rounded-xl font-semibold gap-2 border-gold/30 text-gold hover:bg-gold/10"
            >
              <Equal className="w-4 h-4" />
              Mark as Draw
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ScoreUploadModal;
