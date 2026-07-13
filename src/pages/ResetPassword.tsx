import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, ArrowRight, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import xplayLogoFull from "@/assets/xplay-logo-full.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

/**
 * /auth/reset — set a new password after a recovery-link sign-in.
 *
 * The user lands here with a valid session (the recovery link signs them in);
 * RecoveryRedirect in App.tsx routes them here whenever the
 * `xplay_recovery_pending` flag is set. Self-guarding: with no session it
 * bounces back to /auth.
 */
const ResetPassword = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
      if (!session) {
        localStorage.removeItem("xplay_recovery_pending");
        navigate("/auth", { replace: true });
      }
    });
  }, [navigate]);

  const clearFlagAnd = (path: string) => {
    localStorage.removeItem("xplay_recovery_pending");
    navigate(path, { replace: true });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "Password too short", description: "Use at least 6 characters.", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Passwords don't match", description: "Both fields must be identical.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't update password", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Password updated ✅" });
      clearFlagAnd("/matches");
    }
  };

  if (hasSession === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm space-y-8"
      >
        <div className="text-center space-y-3">
          <img src={xplayLogoFull} alt="X Play" className="w-32 h-32 object-contain mx-auto" />
          <div className="flex items-center justify-center gap-2 text-foreground">
            <KeyRound className="w-4 h-4 text-primary" />
            <h1 className="font-display text-lg font-black italic uppercase">Set a new password</h1>
          </div>
          <p className="text-muted-foreground text-sm">Choose a new password for your account.</p>
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 rounded-xl bg-muted border-border/50 pr-12"
              required
              minLength={6}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          <Input
            type={showPassword ? "text" : "password"}
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="h-12 rounded-xl bg-muted border-border/50"
            required
            minLength={6}
          />
          <Button type="submit" className="w-full h-12 rounded-xl font-semibold gap-2" disabled={saving}>
            Save new password
            <ArrowRight className="w-4 h-4" />
          </Button>
        </form>

        <p className="text-center">
          <button
            onClick={() => clearFlagAnd("/matches")}
            className="text-muted-foreground text-sm hover:text-foreground"
          >
            Skip for now
          </button>
        </p>
      </motion.div>
    </div>
  );
};

export default ResetPassword;
