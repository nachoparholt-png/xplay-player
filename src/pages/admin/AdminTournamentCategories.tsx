import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import SkillCategoryBadge from "@/components/tournaments/SkillCategoryBadge";

interface Category {
  id: string;
  label: string;
  min_rating: number;
  max_rating: number;
  color: string;
  sort_order: number;
}

const AdminTournamentCategories = () => {
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ label: "", min_rating: "0.5", max_rating: "7.0", color: "#6366f1", sort_order: "0" });

  const load = async () => {
    const { data } = await supabase
      .from("tournament_categories")
      .select("*")
      .order("sort_order");
    setCategories((data as Category[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ label: "", min_rating: "0.5", max_rating: "7.0", color: "#6366f1", sort_order: "0" });
    setModalOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditing(cat);
    setForm({
      label: cat.label,
      min_rating: String(cat.min_rating),
      max_rating: String(cat.max_rating),
      color: cat.color,
      sort_order: String(cat.sort_order),
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      label: form.label,
      min_rating: parseFloat(form.min_rating),
      max_rating: parseFloat(form.max_rating),
      color: form.color,
      sort_order: parseInt(form.sort_order),
    };

    if (editing) {
      await supabase.from("tournament_categories").update(payload).eq("id", editing.id);
      toast({ title: "Category updated" });
    } else {
      await supabase.from("tournament_categories").insert(payload);
      toast({ title: "Category created" });
    }

    setSaving(false);
    setModalOpen(false);
    load();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("tournament_categories").delete().eq("id", id);
    toast({ title: "Category deleted" });
    load();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-display font-bold">Skill Categories</h1>
        <Button onClick={openCreate} size="sm" className="rounded-xl gap-1.5">
          <Plus className="w-4 h-4" /> Add
        </Button>
      </div>

      <div className="space-y-2">
        {categories.map((cat) => (
          <div
            key={cat.id}
            className="flex items-center gap-3 p-3.5 rounded-xl border border-border/50 bg-card"
          >
            <SkillCategoryBadge label={cat.label} color={cat.color} size="md" />
            <span className="text-xs text-muted-foreground flex-1">
              {cat.min_rating}–{cat.max_rating}
            </span>
            <Button size="icon" variant="ghost" className="w-8 h-8" onClick={() => openEdit(cat)}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="w-8 h-8 text-destructive" onClick={() => handleDelete(cat.id)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
        {categories.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No categories yet</p>
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Category" : "New Category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Label</Label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Min Rating</Label>
                <Input type="number" step="0.5" value={form.min_rating} onChange={(e) => setForm({ ...form, min_rating: e.target.value })} className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Max Rating</Label>
                <Input type="number" step="0.5" value={form.max_rating} onChange={(e) => setForm({ ...form, max_rating: e.target.value })} className="rounded-xl" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Color</Label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="w-8 h-8 rounded border-0 cursor-pointer" />
                  <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="rounded-xl flex-1" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Sort Order</Label>
                <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} className="rounded-xl" />
              </div>
            </div>
            {form.label && (
              <div className="pt-1">
                <p className="text-xs text-muted-foreground mb-1">Preview:</p>
                <SkillCategoryBadge label={form.label} color={form.color} size="md" />
              </div>
            )}
            <Button onClick={handleSave} disabled={saving || !form.label.trim()} className="w-full rounded-xl h-11">
              {saving ? "Saving..." : editing ? "Update" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminTournamentCategories;
