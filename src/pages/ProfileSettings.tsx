import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Camera, Save, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";



const ProfileSettings = () => {
  const { profile, user, refreshProfile } = useAuth();
  const levelAlreadySet = profile?.padel_level != null;
  const navigate = useNavigate();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    display_name: "",
    location: "",
    preferred_club: "",
    padel_level: 3.0,
    dominant_hand: "right" as string,
    preferred_side: "both" as string,
    bio: "",
    avatar_url: "",
  });

  useEffect(() => {
    if (profile) {
      setForm({
        display_name: profile.display_name || "",
        location: profile.location || "",
        preferred_club: profile.preferred_club || "",
        padel_level: profile.padel_level || 3.0,
        dominant_hand: profile.dominant_hand || "right",
        preferred_side: profile.preferred_side || "both",
        bio: profile.bio || "",
        avatar_url: profile.avatar_url || "",
      });
    }
  }, [profile]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    const fileExt = file.name.split(".").pop();
    const filePath = `${user.id}/avatar.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
    setForm((prev) => ({ ...prev, avatar_url: data.publicUrl }));
    setUploading(false);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: form.display_name.trim() || null,
        location: form.location.trim() || null,
        preferred_club: form.preferred_club.trim() || null,
        padel_level: form.padel_level,
        dominant_hand: form.dominant_hand,
        preferred_side: form.preferred_side,
        bio: form.bio.trim() || null,
        avatar_url: form.avatar_url || null,
      })
      .eq("user_id", user.id);

    if (error) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } else {
      await refreshProfile();
      toast({ title: "Profile updated!" });
      navigate("/profile");
    }
    setSaving(false);
  };

  return (
    <div className="px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/profile")} className="p-2.5 rounded-xl bg-muted hover:bg-muted/80 transition-colors">
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </button>
        <h1 className="text-2xl font-display font-bold">Edit Profile</h1>
      </div>

      {/* Avatar */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-2">
        <label className="relative cursor-pointer">
          <Avatar className="w-24 h-24">
            <AvatarImage src={form.avatar_url} />
            <AvatarFallback className="text-2xl font-bold bg-muted">
              {form.display_name?.[0]?.toUpperCase() || "?"}
            </AvatarFallback>
          </Avatar>
          {/* Camera badge — always visible on mobile, no hover needed */}
          <div className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-lg border-2 border-background">
            {uploading
              ? <div className="w-3 h-3 border border-primary-foreground border-t-transparent rounded-full animate-spin" />
              : <Camera className="w-3.5 h-3.5 text-primary-foreground" />}
          </div>
          <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploading} />
        </label>
        <p className="text-xs text-muted-foreground">Tap to change photo</p>
      </motion.div>

      {/* Form fields */}
      <div className="space-y-4">
        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1.5 block">Display Name</label>
          <Input
            value={form.display_name}
            onChange={(e) => setForm((p) => ({ ...p, display_name: e.target.value }))}
            className="h-12 rounded-xl bg-muted border-border/50"
            placeholder="Your name"
            maxLength={50}
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1.5 block">Location</label>
          <Input
            value={form.location}
            onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
            className="h-12 rounded-xl bg-muted border-border/50"
            placeholder="City, Country"
            maxLength={100}
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1.5 block">Preferred Club</label>
          <Input
            value={form.preferred_club}
            onChange={(e) => setForm((p) => ({ ...p, preferred_club: e.target.value }))}
            className="h-12 rounded-xl bg-muted border-border/50"
            placeholder="Your home club"
            maxLength={100}
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1.5 block">
            Padel Level: {form.padel_level.toFixed(1)}
          </label>
          {levelAlreadySet ? (
            <div className="card-elevated p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Level locked at <strong className="text-foreground">{form.padel_level.toFixed(1)}</strong></span>
              </div>
              <p className="text-xs text-muted-foreground">Your padel level is set during first login and cannot be changed manually.</p>
            </div>
          ) : (
            <>
              <Slider
                value={[form.padel_level]}
                onValueChange={([v]) => setForm((p) => ({ ...p, padel_level: v }))}
                min={0.5}
                max={7.0}
                step={0.5}
                className="py-2"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>0.5 Beginner</span>
                <span>7.0 Pro</span>
              </div>
              {/* Level reference guide */}
              <div className="mt-3 card-elevated p-3 space-y-1.5">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Level Reference Guide</p>
                {[
                  { range: "1 – 2", label: "Beginners", color: "text-muted-foreground" },
                  { range: "2.5 – 3", label: "Low Intermediate", color: "text-muted-foreground" },
                  { range: "3 – 4", label: "Intermediate", color: "text-foreground" },
                  { range: "4 – 5", label: "Advanced", color: "text-primary" },
                  { range: "5+", label: "Tournament / Elite", color: "text-primary" },
                ].map((tier) => (
                  <div key={tier.range} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-mono">{tier.range}</span>
                    <span className={`font-medium ${tier.color}`}>{tier.label}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1.5 block">Dominant Hand</label>
            <Select value={form.dominant_hand} onValueChange={(v) => setForm((p) => ({ ...p, dominant_hand: v }))}>
              <SelectTrigger className="h-12 rounded-xl bg-muted border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="right">Right</SelectItem>
                <SelectItem value="left">Left</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1.5 block">Preferred Side</label>
            <Select value={form.preferred_side} onValueChange={(v) => setForm((p) => ({ ...p, preferred_side: v }))}>
              <SelectTrigger className="h-12 rounded-xl bg-muted border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="right">Right</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1.5 block">Bio</label>
          <Textarea
            value={form.bio}
            onChange={(e) => setForm((p) => ({ ...p, bio: e.target.value }))}
            className="rounded-xl bg-muted border-border/50 min-h-[100px]"
            placeholder="Tell the community about yourself..."
            maxLength={300}
          />
          <p className="text-[10px] text-muted-foreground text-right mt-1">{form.bio.length}/300</p>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full h-12 rounded-xl font-semibold gap-2">
        <Save className="w-4 h-4" />
        {saving ? "Saving..." : "Save Changes"}
      </Button>
    </div>
  );
};

export default ProfileSettings;
