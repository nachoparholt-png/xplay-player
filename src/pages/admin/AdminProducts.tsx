import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { storefrontApiRequest, PRODUCT_BY_HANDLE_QUERY } from "@/lib/shopify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Trash2, Loader2, Package, Download } from "lucide-react";
import { toast } from "sonner";

interface Product {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  shopify_product_id: string | null;
  shopify_variant_id: string | null;
  point_price: number;
  cash_price_cents: number;
  stock: number;
  active: boolean;
  category: string;
}

const emptyProduct: Omit<Product, "id"> = {
  title: "",
  description: "",
  image_url: "",
  shopify_product_id: "",
  shopify_variant_id: "",
  point_price: 0,
  cash_price_cents: 0,
  stock: 0,
  active: true,
  category: "general",
};

const AdminProducts = () => {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyProduct);
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);

  const fetchFromShopify = async () => {
    const gid = form.shopify_product_id;
    if (!gid) { toast.error("Enter a Shopify Product ID first"); return; }
    setFetching(true);
    try {
      // Query by ID using Storefront API
      const query = `query($id: ID!) { node(id: $id) { ... on Product { title description handle images(first: 1) { edges { node { url } } } variants(first: 1) { edges { node { id } } } } } }`;
      const data = await storefrontApiRequest(query, { id: gid });
      const product = data?.data?.node;
      if (!product) throw new Error("Product not found on Shopify");
      setForm((f: typeof emptyProduct) => ({
        ...f,
        title: product.title || f.title,
        description: product.description || f.description,
        image_url: product.images?.edges?.[0]?.node?.url || f.image_url,
        shopify_variant_id: product.variants?.edges?.[0]?.node?.id || f.shopify_variant_id,
      }));
      toast.success("Fetched from Shopify");
    } catch (err: any) {
      toast.error("Fetch failed: " + err.message);
    } finally {
      setFetching(false);
    }
  };

  const { data: products, isLoading } = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("*").order("created_at", { ascending: false });
      return (data || []) as Product[];
    },
  });

  const openCreate = () => {
    setEditingProduct(null);
    setForm(emptyProduct);
    setModalOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditingProduct(p);
    setForm({
      title: p.title,
      description: p.description || "",
      image_url: p.image_url || "",
      shopify_product_id: p.shopify_product_id || "",
      shopify_variant_id: p.shopify_variant_id || "",
      point_price: p.point_price,
      cash_price_cents: p.cash_price_cents,
      stock: p.stock,
      active: p.active,
      category: p.category,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      if (editingProduct) {
        const { error } = await supabase.from("products").update(form).eq("id", editingProduct.id);
        if (error) throw error;
        toast.success("Product updated");
      } else {
        const { error } = await supabase.from("products").insert(form);
        if (error) throw error;
        toast.success("Product created");
      }
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      setModalOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Product deleted");
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    }
  };

  const toggleActive = async (p: Product) => {
    await supabase.from("products").update({ active: !p.active }).eq("id", p.id);
    queryClient.invalidateQueries({ queryKey: ["admin-products"] });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Package className="w-6 h-6 text-primary" /> Products
          </h1>
          <p className="text-sm text-muted-foreground">{products?.length || 0} products</p>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-1" /> Add Product</Button>
      </div>

      {/* Info banner: stock is now managed in Shopify */}
      <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
        <Package className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <div>
          <span className="font-medium text-primary">Stock is managed in Shopify.</span>
          <span className="text-muted-foreground ml-1">
            Inventory levels and availability are pulled live from Shopify. XP price is set via the{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">custom.xplay_points_price</code>{" "}
            metafield on each Shopify product.
          </span>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">XP Price</TableHead>
                <TableHead className="text-right">Cash (£)</TableHead>
                <TableHead>Shopify Linked</TableHead>
                <TableHead>Active</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products?.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded bg-secondary/20 overflow-hidden">
                        {p.image_url ? <img src={p.image_url} alt={p.title} className="w-full h-full object-cover" /> : <Package className="w-full h-full p-2 text-muted-foreground" />}
                      </div>
                      <span className="font-medium text-sm">{p.title}</span>
                    </div>
                  </TableCell>
                  <TableCell className="capitalize text-sm">{p.category}</TableCell>
                  <TableCell className="text-right text-sm font-mono">{p.point_price} XP</TableCell>
                  <TableCell className="text-right text-sm font-mono">£{(p.cash_price_cents / 100).toFixed(2)}</TableCell>
                  <TableCell>
                    {p.shopify_product_id
                      ? <span className="text-xs text-emerald-500 font-medium">✓ Linked</span>
                      : <span className="text-xs text-destructive font-medium">⚠ Not linked</span>}
                  </TableCell>
                  <TableCell>
                    <Switch checked={p.active} onCheckedChange={() => toggleActive(p)} />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(p.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(!products || products.length === 0) && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No products yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Product Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Edit Product" : "Add Product"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">New workflow (Option 2)</p>
              <p>1. Add the product in Shopify first, set its inventory there.</p>
              <p>2. Paste the Shopify Product ID below and hit <strong>↓</strong> to auto-fill.</p>
              <p>3. Set the <code>custom.xplay_points_price</code> metafield in Shopify to control XP price. The XP Price field here is the fallback.</p>
            </div>
            <div>
              <Label>Shopify Product ID</Label>
              <div className="flex gap-2">
                <Input value={form.shopify_product_id || ""} onChange={(e) => setForm({ ...form, shopify_product_id: e.target.value })} placeholder="gid://shopify/Product/..." className="flex-1" style={{ fontSize: "16px" }} />
                <Button type="button" variant="outline" size="sm" onClick={fetchFromShopify} disabled={fetching || !form.shopify_product_id}>
                  {fetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Hit ↓ to auto-fill title, image and variant ID from Shopify</p>
            </div>
            <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={{ fontSize: "16px" }} /></div>
            <div><Label>Description</Label><Textarea value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} style={{ fontSize: "16px" }} /></div>
            <div><Label>Image URL</Label><Input value={form.image_url || ""} onChange={(e) => setForm({ ...form, image_url: e.target.value })} style={{ fontSize: "16px" }} /></div>
            <div><Label>Shopify Variant ID</Label><Input value={form.shopify_variant_id || ""} onChange={(e) => setForm({ ...form, shopify_variant_id: e.target.value })} placeholder="gid://shopify/ProductVariant/..." style={{ fontSize: "16px" }} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>XP Price (fallback)</Label>
                <Input type="number" value={form.point_price} onChange={(e) => setForm({ ...form, point_price: parseInt(e.target.value) || 0 })} style={{ fontSize: "16px" }} />
                <p className="text-xs text-muted-foreground mt-1">Overridden by Shopify metafield</p>
              </div>
              <div><Label>Cash Price (pence)</Label><Input type="number" value={form.cash_price_cents} onChange={(e) => setForm({ ...form, cash_price_cents: parseInt(e.target.value) || 0 })} style={{ fontSize: "16px" }} /></div>
            </div>
            <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={{ fontSize: "16px" }} /></div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
              <Label>Active in XPLAY marketplace</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {editingProduct ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminProducts;
