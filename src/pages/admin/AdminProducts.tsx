import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Trash2, Loader2, Package, Upload, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { formatPence, type StoreProduct } from "@/lib/store";
import { xpToPence } from "@/lib/pointsCopy";

// Generated types predate the store tables.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface VariantForm {
  id?: string;
  label: string;
  sku: string;
  stock: number;
  low_stock_threshold: number;
  active: boolean;
}

interface ProductForm {
  title: string;
  description: string;
  image_url: string;
  point_price: number;
  category: string;
  delivery_size: "small" | "large";
  active: boolean;
  variants: VariantForm[];
}

const newVariant = (label = "One size"): VariantForm => ({ label, sku: "", stock: 0, low_stock_threshold: 3, active: true });
const emptyForm: ProductForm = {
  title: "", description: "", image_url: "", point_price: 0, category: "general", delivery_size: "small", active: true, variants: [newVariant()],
};

const SETTINGS = [
  { key: "store_delivery_fee_small_pence", label: "Small parcel delivery (pence)" },
  { key: "store_delivery_fee_large_pence", label: "Large parcel delivery (pence)" },
  { key: "store_free_delivery_per_month", label: "Free XPLAY Pro deliveries per month" },
] as const;

const AdminProducts = () => {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StoreProduct | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [savingSettings, setSavingSettings] = useState(false);

  const { data: products, isLoading } = useQuery({
    queryKey: ["admin-products"],
    queryFn: async (): Promise<StoreProduct[]> => {
      const { data, error } = await db.from("products").select("*, product_variants(*)").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: settingRows } = useQuery({
    queryKey: ["admin-store-settings"],
    queryFn: async () => {
      const { data } = await db.from("app_settings").select("key, value").in("key", SETTINGS.map((s) => s.key));
      return (data ?? []) as { key: string; value: string }[];
    },
  });
  useEffect(() => {
    if (settingRows) setSettings(Object.fromEntries(settingRows.map((r) => [r.key, r.value])));
  }, [settingRows]);

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      for (const s of SETTINGS) {
        const value = String(Math.max(0, parseInt(settings[s.key] ?? "0", 10) || 0));
        const { error } = await db.from("app_settings").update({ value, updated_at: new Date().toISOString() }).eq("key", s.key);
        if (error) throw error;
      }
      toast.success("Store settings saved");
      queryClient.invalidateQueries({ queryKey: ["admin-store-settings"] });
      queryClient.invalidateQueries({ queryKey: ["store-delivery-settings"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save settings");
    } finally {
      setSavingSettings(false);
    }
  };

  const openCreate = () => { setEditing(null); setForm(emptyForm); setModalOpen(true); };

  const openEdit = (p: StoreProduct) => {
    setEditing(p);
    const variants = [...(p.product_variants ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((v) => ({ id: v.id, label: v.label, sku: v.sku ?? "", stock: v.stock, low_stock_threshold: v.low_stock_threshold, active: v.active }));
    setForm({
      title: p.title, description: p.description ?? "", image_url: p.image_url ?? "", point_price: Math.ceil(p.point_price),
      category: p.category, delivery_size: p.delivery_size ?? "small", active: p.active,
      variants: variants.length ? variants : [newVariant()],
    });
    setModalOpen(true);
  };

  const handleImage = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5 MB"); return; }
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("product-images").upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      setForm((f) => ({ ...f, image_url: data.publicUrl }));
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const setVariant = (idx: number, patch: Partial<VariantForm>) =>
    setForm((f) => ({ ...f, variants: f.variants.map((v, i) => (i === idx ? { ...v, ...patch } : v)) }));

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    if (form.point_price <= 0) { toast.error("Set a price in XPLAY Points"); return; }
    const labels = form.variants.map((v) => v.label.trim().toLowerCase());
    if (labels.some((l) => !l)) { toast.error("Every size needs a name"); return; }
    if (new Set(labels).size !== labels.length) { toast.error("Two sizes have the same name"); return; }

    setSaving(true);
    try {
      const productRow = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        image_url: form.image_url.trim() || null,
        point_price: form.point_price,
        cash_price_cents: xpToPence(form.point_price), // one rate: 100 XP = £1
        category: form.category.trim() || "general",
        delivery_size: form.delivery_size,
        active: form.active,
        stock: form.variants.reduce((n, v) => n + (v.active ? v.stock : 0), 0), // legacy column, kept in step
      };
      let productId = editing?.id;
      if (productId) {
        const { error } = await db.from("products").update(productRow).eq("id", productId);
        if (error) throw error;
      } else {
        const { data, error } = await db.from("products").insert(productRow).select("id").single();
        if (error) throw error;
        productId = data.id;
      }

      for (const [i, v] of form.variants.entries()) {
        const row = {
          product_id: productId, label: v.label.trim(), sku: v.sku.trim() || null,
          stock: Math.max(0, v.stock), low_stock_threshold: Math.max(0, v.low_stock_threshold), active: v.active, sort_order: i,
          updated_at: new Date().toISOString(),
        };
        const { error } = v.id ? await db.from("product_variants").update(row).eq("id", v.id) : await db.from("product_variants").insert(row);
        if (error) throw error;
      }
      toast.success(editing ? "Product updated" : "Product created");
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      queryClient.invalidateQueries({ queryKey: ["store-products"] });
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: StoreProduct) => {
    if (!confirm(`Delete "${p.title}"? Products that already have orders cannot be deleted — switch them off instead.`)) return;
    const { error } = await db.from("products").delete().eq("id", p.id);
    if (error) toast.error("This product has orders, so it can't be deleted. Switch it off instead.");
    else { toast.success("Product deleted"); queryClient.invalidateQueries({ queryKey: ["admin-products"] }); }
  };

  const toggleActive = async (p: StoreProduct) => {
    const { error } = await db.from("products").update({ active: !p.active }).eq("id", p.id);
    if (error) toast.error(error.message);
    queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    queryClient.invalidateQueries({ queryKey: ["store-products"] });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Package className="w-6 h-6 text-primary" /> Products & stock
          </h1>
          <p className="text-sm text-muted-foreground">{products?.length || 0} products · stock is managed here, per size</p>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-1" /> Add product</Button>
      </div>

      {/* Store settings */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h2 className="font-semibold text-sm">Delivery settings (UK only)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {SETTINGS.map((s) => (
              <div key={s.key}>
                <Label className="text-xs">{s.label}</Label>
                <Input type="number" min={0} value={settings[s.key] ?? ""} onChange={(e) => setSettings({ ...settings, [s.key]: e.target.value })} style={{ fontSize: "16px" }} />
                {s.key !== "store_free_delivery_per_month" && (
                  <p className="text-xs text-muted-foreground mt-1">= {formatPence(parseInt(settings[s.key] ?? "0", 10) || 0)}</p>
                )}
              </div>
            ))}
          </div>
          <Button size="sm" onClick={saveSettings} disabled={savingSettings}>
            {savingSettings ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Save settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Parcel</TableHead>
                <TableHead>Stock by size</TableHead>
                <TableHead>Active</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products?.map((p) => {
                const variants = [...(p.product_variants ?? [])].sort((a, b) => a.sort_order - b.sort_order);
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded bg-secondary/20 overflow-hidden shrink-0">
                          {p.image_url ? <img src={p.image_url} alt={p.title} className="w-full h-full object-cover" /> : <Package className="w-full h-full p-2 text-muted-foreground" />}
                        </div>
                        <span className="font-medium text-sm">{p.title}</span>
                      </div>
                    </TableCell>
                    <TableCell className="capitalize text-sm">{p.category}</TableCell>
                    <TableCell className="text-right text-sm font-mono whitespace-nowrap">
                      {Math.ceil(p.point_price).toLocaleString()} XP<br />
                      <span className="text-muted-foreground">{formatPence(xpToPence(Math.ceil(p.point_price)))}</span>
                    </TableCell>
                    <TableCell className="capitalize text-sm">{p.delivery_size ?? "small"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {variants.map((v) => {
                          const out = v.stock <= 0;
                          const low = !out && v.stock <= v.low_stock_threshold;
                          return (
                            <span
                              key={v.id}
                              className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md border ${
                                !v.active ? "border-border text-muted-foreground line-through"
                                  : out ? "border-destructive/50 bg-destructive/10 text-destructive"
                                  : low ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
                                  : "border-border text-foreground"
                              }`}
                            >
                              {(out || low) && v.active && <AlertTriangle className="w-3 h-3" />}
                              {v.label}: {v.stock}
                            </span>
                          );
                        })}
                      </div>
                    </TableCell>
                    <TableCell><Switch checked={p.active} onCheckedChange={() => toggleActive(p)} /></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(p)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {(!products || products.length === 0) && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No products yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit product" : "Add product"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={{ fontSize: "16px" }} /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} style={{ fontSize: "16px" }} /></div>

            <div>
              <Label>Image</Label>
              <div className="flex items-center gap-3 mt-1">
                <div className="w-16 h-16 rounded-lg bg-secondary/20 overflow-hidden shrink-0">
                  {form.image_url ? <img src={form.image_url} alt="" className="w-full h-full object-cover" /> : <Package className="w-full h-full p-4 text-muted-foreground" />}
                </div>
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm font-medium cursor-pointer">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {form.image_url ? "Replace image" : "Upload image"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImage(e.target.files?.[0])} />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Price (XPLAY Points)</Label>
                <Input type="number" min={0} value={form.point_price} onChange={(e) => setForm({ ...form, point_price: parseInt(e.target.value) || 0 })} style={{ fontSize: "16px" }} />
                <p className="text-xs text-muted-foreground mt-1">= {formatPence(xpToPence(form.point_price))} by card (100 XP = £1)</p>
              </div>
              <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={{ fontSize: "16px" }} /></div>
            </div>

            <div>
              <Label>Parcel size (sets the delivery fee)</Label>
              <div className="flex gap-2 mt-1">
                {(["small", "large"] as const).map((size) => (
                  <Button key={size} type="button" size="sm" variant={form.delivery_size === size ? "default" : "outline"} className="capitalize" onClick={() => setForm({ ...form, delivery_size: size })}>
                    {size} parcel
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Sizes and stock</Label>
              <div className="grid grid-cols-[1fr_5rem_5rem_auto] gap-2 text-xs text-muted-foreground px-0.5">
                <span>Size</span><span>In stock</span><span>Warn at</span><span>On</span>
              </div>
              {form.variants.map((v, i) => (
                <div key={v.id ?? `new-${i}`} className="grid grid-cols-[1fr_5rem_5rem_auto] gap-2 items-center">
                  <Input value={v.label} placeholder="e.g. M" onChange={(e) => setVariant(i, { label: e.target.value })} style={{ fontSize: "16px" }} />
                  <Input type="number" min={0} value={v.stock} onChange={(e) => setVariant(i, { stock: parseInt(e.target.value) || 0 })} style={{ fontSize: "16px" }} />
                  <Input type="number" min={0} value={v.low_stock_threshold} onChange={(e) => setVariant(i, { low_stock_threshold: parseInt(e.target.value) || 0 })} style={{ fontSize: "16px" }} />
                  {v.id ? (
                    <Switch checked={v.active} onCheckedChange={(on) => setVariant(i, { active: on })} />
                  ) : (
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" disabled={form.variants.length === 1}
                      onClick={() => setForm((f) => ({ ...f, variants: f.variants.filter((_, idx) => idx !== i) }))}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setForm((f) => ({ ...f, variants: [...f.variants, newVariant("")] }))}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add a size
              </Button>
              <p className="text-xs text-muted-foreground">One product with no sizes? Keep a single "One size" row. Sizes that already exist are switched off rather than deleted, so old orders keep their size.</p>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
              <Label>Show in the XPLAY store</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || uploading}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminProducts;
