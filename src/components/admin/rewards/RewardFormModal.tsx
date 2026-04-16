import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, Upload, X, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Reward = {
  id: string;
  reward_name: string;
  reward_description: string | null;
  reward_image: string | null;
  category: string;
  points_cost: number;
  status: string;
  source_type: string;
  code_required: boolean;
  stock_mode: string;
  external_store_name: string | null;
  external_quantity: number | null;
  low_stock_threshold: number | null;
  current_stock: number | null;
  stock_limit: number | null;
  valid_from: string | null;
  valid_until: string | null;
  max_redemptions_per_user: number | null;
  admin_notes: string | null;
  sort_order: number | null;
  linked_store_id: string | null;
  stock_status: string;
  redemption_instructions: string | null;
};

type StoreRecord = { id: string; store_name: string };

interface Props {
  reward: Reward | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}

const defaultForm = {
  reward_name: "",
  reward_description: "",
  reward_image: "",
  category: "gift_card",
  points_cost: 100,
  status: "active",
  source_type: "internal_coupon",
  code_required: false,
  stock_mode: "manual_quantity_stock",
  external_store_name: "",
  external_quantity: null as number | null,
  low_stock_threshold: 5,
  current_stock: null as number | null,
  stock_limit: null as number | null,
  valid_from: "",
  valid_until: "",
  max_redemptions_per_user: null as number | null,
  admin_notes: "",
  sort_order: 0,
  linked_store_id: "" as string,
  stock_status: "in_stock",
  redemption_instructions: "",
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <label className="text-xs font-medium text-muted-foreground">{label}</label>
    {children}
  </div>
);

const RewardFormModal = ({ reward, open, onOpenChange, onSaved }: Props) => {
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [stores, setStores] = useState<StoreRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please select an image file", variant: "destructive" });
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop();
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("reward-images").upload(fileName, file);
    if (error) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    } else {
      const { data: urlData } = supabase.storage.from("reward-images").getPublicUrl(fileName);
      setForm((prev) => ({ ...prev, reward_image: urlData.publicUrl }));
      toast({ title: "Image uploaded" });
    }
    setUploading(false);
  };

  useEffect(() => {
    if (open) {
      supabase.from("stores").select("id, store_name").order("store_name").then(({ data }) => {
        setStores(data || []);
      });

      if (reward) {
        setForm({
          reward_name: reward.reward_name,
          reward_description: reward.reward_description || "",
          reward_image: reward.reward_image || "",
          category: reward.category,
          points_cost: reward.points_cost,
          status: reward.status,
          source_type: reward.source_type,
          code_required: reward.code_required,
          stock_mode: reward.stock_mode,
          external_store_name: reward.external_store_name || "",
          external_quantity: reward.external_quantity,
          low_stock_threshold: reward.low_stock_threshold ?? 5,
          current_stock: reward.current_stock,
          stock_limit: reward.stock_limit,
          valid_from: reward.valid_from?.split("T")[0] || "",
          valid_until: reward.valid_until?.split("T")[0] || "",
          max_redemptions_per_user: reward.max_redemptions_per_user,
          admin_notes: reward.admin_notes || "",
          sort_order: reward.sort_order ?? 0,
          linked_store_id: reward.linked_store_id || "",
          stock_status: reward.stock_status || "in_stock",
          redemption_instructions: reward.redemption_instructions || "",
        });
      } else {
        setForm(defaultForm);
      }
    }
  }, [open, reward]);

  const handleSave = async () => {
    if (!form.reward_name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    setSaving(true);

    const payload: any = {
      reward_name: form.reward_name.trim(),
      reward_description: form.reward_description || null,
      reward_image: form.reward_image || null,
      category: form.category,
      points_cost: form.points_cost,
      status: form.status,
      source_type: form.source_type,
      code_required: form.code_required,
      stock_mode: form.stock_mode,
      external_store_name: form.external_store_name || null,
      external_quantity: form.external_quantity,
      low_stock_threshold: form.low_stock_threshold,
      current_stock: form.current_stock,
      stock_limit: form.stock_limit,
      valid_from: form.valid_from || null,
      valid_until: form.valid_until || null,
      max_redemptions_per_user: form.max_redemptions_per_user,
      admin_notes: form.admin_notes || null,
      sort_order: form.sort_order,
      linked_store_id: form.linked_store_id || null,
      stock_status: form.stock_status,
      redemption_instructions: form.redemption_instructions || null,
    };

    let error;
    if (reward) {
      ({ error } = await supabase.from("rewards").update(payload).eq("id", reward.id));
    } else {
      ({ error } = await supabase.from("rewards").insert(payload));
    }

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: reward ? "Reward updated" : "Reward created" });
      onOpenChange(false);
      onSaved();
    }
    setSaving(false);
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{reward ? "Edit Reward" : "Create Reward"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Reward Name">
            <Input value={form.reward_name} onChange={(e) => setForm({ ...form, reward_name: e.target.value })} />
          </Field>

          <Field label="Description">
            <textarea
              value={form.reward_description}
              onChange={(e) => setForm({ ...form, reward_description: e.target.value })}
              className="w-full h-16 rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm resize-none"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Points Cost">
              <Input type="number" value={form.points_cost} onChange={(e) => setForm({ ...form, points_cost: parseInt(e.target.value) || 0 })} />
            </Field>
            <Field label="Category">
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full h-10 rounded-xl border border-border bg-muted/50 px-3 text-sm"
              >
                <option value="gift_card">Gift Card</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full h-10 rounded-xl border border-border bg-muted/50 px-3 text-sm"
              >
                <option value="active">Active</option>
                <option value="coming_soon">Coming Soon</option>
                <option value="expired">Expired</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </select>
            </Field>
            <Field label="Stock Status">
              <select
                value={form.stock_status}
                onChange={(e) => setForm({ ...form, stock_status: e.target.value })}
                className="w-full h-10 rounded-xl border border-border bg-muted/50 px-3 text-sm"
              >
                <option value="in_stock">In Stock</option>
                <option value="out_of_stock">Out of Stock</option>
                <option value="coming_soon">Coming Soon</option>
              </select>
            </Field>
          </div>

          <Field label="Linked Store">
            <select
              value={form.linked_store_id}
              onChange={(e) => setForm({ ...form, linked_store_id: e.target.value })}
              className="w-full h-10 rounded-xl border border-border bg-muted/50 px-3 text-sm"
            >
              <option value="">No store linked</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.store_name}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Source Type">
              <select
                value={form.source_type}
                onChange={(e) => setForm({ ...form, source_type: e.target.value })}
                className="w-full h-10 rounded-xl border border-border bg-muted/50 px-3 text-sm"
              >
                <option value="internal_coupon">Internal Coupon</option>
                <option value="shopify_discount_code">Shopify Discount Code</option>
                <option value="shopify_gift_card">Shopify Gift Card</option>
                <option value="external_voucher">External Voucher</option>
              </select>
            </Field>
            <Field label="Stock Mode">
              <select
                value={form.stock_mode}
                onChange={(e) => setForm({ ...form, stock_mode: e.target.value })}
                className="w-full h-10 rounded-xl border border-border bg-muted/50 px-3 text-sm"
              >
                <option value="code_based_stock">Code-Based Stock</option>
                <option value="manual_quantity_stock">Manual Quantity</option>
                <option value="synced_quantity_stock">Synced Quantity</option>
              </select>
            </Field>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
            <div>
              <p className="text-sm font-medium">Code Required</p>
              <p className="text-xs text-muted-foreground">Each unit needs a unique code</p>
            </div>
            <Switch checked={form.code_required} onCheckedChange={(v) => setForm({ ...form, code_required: v })} />
          </div>

          <Field label="Redemption Instructions">
            <textarea
              value={form.redemption_instructions}
              onChange={(e) => setForm({ ...form, redemption_instructions: e.target.value })}
              className="w-full h-16 rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm resize-none"
              placeholder="Enter this code at checkout on the partner store."
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Low Stock Threshold">
              <Input type="number" value={form.low_stock_threshold ?? ""} onChange={(e) => setForm({ ...form, low_stock_threshold: parseInt(e.target.value) || 0 })} />
            </Field>
            <Field label="External Store Name">
              <Input value={form.external_store_name ?? ""} onChange={(e) => setForm({ ...form, external_store_name: e.target.value })} placeholder="e.g. Korde Store" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="External Quantity">
              <Input type="number" value={form.external_quantity ?? ""} onChange={(e) => setForm({ ...form, external_quantity: e.target.value ? parseInt(e.target.value) : null })} />
            </Field>
            <Field label="Max Redemptions / User">
              <Input type="number" value={form.max_redemptions_per_user ?? ""} onChange={(e) => setForm({ ...form, max_redemptions_per_user: e.target.value ? parseInt(e.target.value) : null })} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Current Stock">
              <Input type="number" value={form.current_stock ?? ""} onChange={(e) => setForm({ ...form, current_stock: e.target.value ? parseInt(e.target.value) : null })} />
            </Field>
            <Field label="Sort Order">
              <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Valid From">
              <Input type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} />
            </Field>
            <Field label="Valid Until">
              <Input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
            </Field>
          </div>

          <Field label="Reward Image">
            <div className="space-y-2">
              {form.reward_image ? (
                <div className="relative w-full h-32 rounded-xl overflow-hidden border border-border">
                  <img src={form.reward_image} alt="Reward" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, reward_image: "" })}
                    className="absolute top-1.5 right-1.5 p-1 rounded-full bg-background/80 hover:bg-background text-destructive"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full h-28 rounded-xl border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:text-primary transition-colors"
                >
                  {uploading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <ImageIcon className="w-6 h-6" />
                      <span className="text-xs font-medium">Click to upload image</span>
                    </>
                  )}
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file);
                  e.target.value = "";
                }}
              />
            </div>
          </Field>

          <Field label="Admin Notes">
            <textarea
              value={form.admin_notes ?? ""}
              onChange={(e) => setForm({ ...form, admin_notes: e.target.value })}
              className="w-full h-16 rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm resize-none"
            />
          </Field>

          <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {reward ? "Update Reward" : "Create Reward"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RewardFormModal;
