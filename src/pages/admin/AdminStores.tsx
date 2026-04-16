import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Store, Plus, Edit, Trash2, Loader2, Globe, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";

type StoreRecord = {
  id: string;
  store_name: string;
  website_url: string | null;
  store_logo: string | null;
  store_description: string | null;
  redemption_instructions: string | null;
  store_status: string;
  contact_email: string | null;
  admin_notes: string | null;
  created_at: string;
};

const defaultForm = {
  store_name: "",
  website_url: "",
  store_logo: "",
  store_description: "",
  redemption_instructions: "",
  store_status: "active",
  contact_email: "",
  admin_notes: "",
};

const AdminStores = () => {
  const [stores, setStores] = useState<StoreRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editStore, setEditStore] = useState<StoreRecord | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StoreRecord | null>(null);

  const fetchStores = async () => {
    const { data } = await supabase.from("stores").select("*").order("store_name");
    setStores(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchStores(); }, []);

  const openCreate = () => {
    setEditStore(null);
    setForm(defaultForm);
    setFormOpen(true);
  };

  const openEdit = (s: StoreRecord) => {
    setEditStore(s);
    setForm({
      store_name: s.store_name,
      website_url: s.website_url || "",
      store_logo: s.store_logo || "",
      store_description: s.store_description || "",
      redemption_instructions: s.redemption_instructions || "",
      store_status: s.store_status,
      contact_email: s.contact_email || "",
      admin_notes: s.admin_notes || "",
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.store_name.trim()) {
      toast({ title: "Store name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: any = {
      store_name: form.store_name.trim(),
      website_url: form.website_url || null,
      store_logo: form.store_logo || null,
      store_description: form.store_description || null,
      redemption_instructions: form.redemption_instructions || null,
      store_status: form.store_status,
      contact_email: form.contact_email || null,
      admin_notes: form.admin_notes || null,
    };

    let error;
    if (editStore) {
      ({ error } = await supabase.from("stores").update(payload).eq("id", editStore.id));
    } else {
      ({ error } = await supabase.from("stores").insert(payload));
    }

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editStore ? "Store updated" : "Store created" });
      setFormOpen(false);
      fetchStores();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("stores").delete().eq("id", deleteTarget.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Store deleted" });
      fetchStores();
    }
    setDeleteTarget(null);
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 mt-12 lg:mt-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Store className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold">Store Directory</h1>
            <p className="text-sm text-muted-foreground">Manage external websites where codes can be redeemed</p>
          </div>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          Add Store
        </Button>
      </div>

      {stores.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <Store className="w-12 h-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">No stores added yet</p>
          <Button size="sm" onClick={openCreate}>Add First Store</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {stores.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="card-elevated p-4"
            >
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                  {s.store_logo ? (
                    <img src={s.store_logo} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Store className="w-6 h-6 text-muted-foreground/40" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-display font-bold text-sm">{s.store_name}</h3>
                      {s.store_description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{s.store_description}</p>
                      )}
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${
                      s.store_status === "active" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    }`}>
                      {s.store_status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                    {s.website_url && (
                      <a href={s.website_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-primary transition-colors">
                        <Globe className="w-3 h-3" />
                        {new URL(s.website_url).hostname}
                      </a>
                    )}
                    {s.contact_email && (
                      <span className="flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        {s.contact_email}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(s)} className="h-7 text-xs gap-1">
                      <Edit className="w-3 h-3" />
                      Edit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setDeleteTarget(s)} className="h-7 text-xs gap-1 text-destructive hover:text-destructive">
                      <Trash2 className="w-3 h-3" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{editStore ? "Edit Store" : "Add Store"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Store Name *</label>
              <Input value={form.store_name} onChange={(e) => setForm({ ...form, store_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Website URL</label>
                <Input value={form.website_url} onChange={(e) => setForm({ ...form, website_url: e.target.value })} placeholder="https://..." />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Contact Email</label>
                <Input value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <textarea
                value={form.store_description}
                onChange={(e) => setForm({ ...form, store_description: e.target.value })}
                className="w-full h-16 rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm resize-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Redemption Instructions</label>
              <textarea
                value={form.redemption_instructions}
                onChange={(e) => setForm({ ...form, redemption_instructions: e.target.value })}
                className="w-full h-16 rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm resize-none"
                placeholder="Enter this code at checkout on the partner store."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Status</label>
                <select
                  value={form.store_status}
                  onChange={(e) => setForm({ ...form, store_status: e.target.value })}
                  className="w-full h-10 rounded-xl border border-border bg-muted/50 px-3 text-sm"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Logo URL</label>
                <Input value={form.store_logo} onChange={(e) => setForm({ ...form, store_logo: e.target.value })} placeholder="https://..." />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Admin Notes</label>
              <textarea
                value={form.admin_notes}
                onChange={(e) => setForm({ ...form, admin_notes: e.target.value })}
                className="w-full h-12 rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm resize-none"
              />
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {editStore ? "Update Store" : "Create Store"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Store</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.store_name}</strong>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminStores;
