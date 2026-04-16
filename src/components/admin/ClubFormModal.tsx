import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Club = {
  id: string;
  club_name: string;
  approximate_location: string;
  city: string;
  region: string;
  country: string;
  number_of_courts: number;
  main_court_type: string;
  typical_active_hours: string;
  club_status: string;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  club_description: string | null;
  address_line_1: string;
  postcode: string;
  latitude: number | null;
  longitude: number | null;
  amenities: string | null;
  operating_hours: string | null;
  parking_info: string | null;
  notes_for_admin: string | null;
};

const emptyForm = {
  club_name: "",
  club_description: "",
  club_status: "active",
  approximate_location: "",
  address_line_1: "",
  city: "",
  region: "",
  country: "",
  postcode: "",
  latitude: "",
  longitude: "",
  number_of_courts: "1",
  main_court_type: "indoor",
  typical_active_hours: "07:00–23:00",
  operating_hours: "",
  amenities: "",
  contact_email: "",
  contact_phone: "",
  website: "",
  parking_info: "",
  notes_for_admin: "",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  club: Club | null;
  onSaved: (addAnother: boolean) => void;
}

const ClubFormModal = ({ open, onOpenChange, club, onSaved }: Props) => {
  const { toast } = useToast();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (club) {
      setForm({
        club_name: club.club_name,
        club_description: club.club_description || "",
        club_status: club.club_status,
        approximate_location: club.approximate_location,
        address_line_1: club.address_line_1,
        city: club.city,
        region: club.region,
        country: club.country,
        postcode: club.postcode,
        latitude: club.latitude?.toString() || "",
        longitude: club.longitude?.toString() || "",
        number_of_courts: club.number_of_courts.toString(),
        main_court_type: club.main_court_type,
        typical_active_hours: club.typical_active_hours,
        operating_hours: club.operating_hours || "",
        amenities: club.amenities || "",
        contact_email: club.contact_email || "",
        contact_phone: club.contact_phone || "",
        website: club.website || "",
        parking_info: club.parking_info || "",
        notes_for_admin: club.notes_for_admin || "",
      });
    } else {
      setForm(emptyForm);
    }
  }, [club, open]);

  const set = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));

  const validate = (): string | null => {
    if (!form.club_name.trim()) return "Club name is required.";
    if (!form.approximate_location.trim()) return "Approximate location is required.";
    const courts = parseInt(form.number_of_courts);
    if (isNaN(courts) || courts < 1) return "Number of courts must be a positive number.";
    if (form.latitude && (isNaN(Number(form.latitude)) || Math.abs(Number(form.latitude)) > 90)) return "Invalid latitude.";
    if (form.longitude && (isNaN(Number(form.longitude)) || Math.abs(Number(form.longitude)) > 180)) return "Invalid longitude.";
    if (form.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email)) return "Invalid email format.";
    return null;
  };

  const handleSave = async (addAnother: boolean) => {
    const err = validate();
    if (err) {
      toast({ title: "Validation error", description: err, variant: "destructive" });
      return;
    }

    setSaving(true);
    const payload: any = {
      club_name: form.club_name.trim(),
      club_description: form.club_description.trim() || null,
      club_status: form.club_status,
      approximate_location: form.approximate_location.trim(),
      address_line_1: form.address_line_1.trim(),
      city: form.city.trim(),
      region: form.region.trim(),
      country: form.country.trim(),
      postcode: form.postcode.trim(),
      latitude: form.latitude ? parseFloat(form.latitude) : null,
      longitude: form.longitude ? parseFloat(form.longitude) : null,
      number_of_courts: parseInt(form.number_of_courts),
      main_court_type: form.main_court_type,
      typical_active_hours: form.typical_active_hours.trim(),
      operating_hours: form.operating_hours.trim() || null,
      amenities: form.amenities.trim() || null,
      contact_email: form.contact_email.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      website: form.website.trim() || null,
      parking_info: form.parking_info.trim() || null,
      notes_for_admin: form.notes_for_admin.trim() || null,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (club) {
      ({ error } = await supabase.from("clubs").update(payload).eq("id", club.id));
    } else {
      ({ error } = await supabase.from("clubs").insert(payload));
    }

    if (error) {
      const msg = error.message.includes("clubs_club_name_unique")
        ? "A club with this name already exists."
        : error.message;
      toast({ title: "Error saving club", description: msg, variant: "destructive" });
    } else {
      toast({ title: club ? "Club updated ✓" : "Club created ✓" });
      if (addAnother) setForm(emptyForm);
      onSaved(addAnother);
    }
    setSaving(false);
  };

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h3 className="font-display font-bold text-sm text-muted-foreground uppercase tracking-wider pt-3 pb-1 border-t border-border/30 first:border-t-0 first:pt-0">
      {children}
    </h3>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{club ? "Edit Club" : "Add Club"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <SectionTitle>Basic Information</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label className="text-xs">Club Name *</Label>
              <Input value={form.club_name} onChange={(e) => set("club_name", e.target.value)} maxLength={200} className="mt-1" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Description</Label>
              <Textarea value={form.club_description} onChange={(e) => set("club_description", e.target.value)} maxLength={1000} className="mt-1 min-h-[60px]" />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={form.club_status} onValueChange={(v) => set("club_status", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <SectionTitle>Location</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label className="text-xs">Approximate Location *</Label>
              <Input value={form.approximate_location} onChange={(e) => set("approximate_location", e.target.value)} placeholder="e.g. Epsom, South West London" maxLength={200} className="mt-1" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Address</Label>
              <Input value={form.address_line_1} onChange={(e) => set("address_line_1", e.target.value)} maxLength={300} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">City</Label>
              <Input value={form.city} onChange={(e) => set("city", e.target.value)} maxLength={100} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Region</Label>
              <Input value={form.region} onChange={(e) => set("region", e.target.value)} maxLength={100} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Country</Label>
              <Input value={form.country} onChange={(e) => set("country", e.target.value)} maxLength={100} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Postcode</Label>
              <Input value={form.postcode} onChange={(e) => set("postcode", e.target.value)} maxLength={20} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Latitude</Label>
              <Input value={form.latitude} onChange={(e) => set("latitude", e.target.value)} placeholder="51.335" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Longitude</Label>
              <Input value={form.longitude} onChange={(e) => set("longitude", e.target.value)} placeholder="-0.267" className="mt-1" />
            </div>
          </div>

          <SectionTitle>Venue Details</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Number of Courts *</Label>
              <Input type="number" min={1} value={form.number_of_courts} onChange={(e) => set("number_of_courts", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Main Court Type *</Label>
              <Select value={form.main_court_type} onValueChange={(v) => set("main_court_type", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="indoor">Indoor</SelectItem>
                  <SelectItem value="outdoor">Outdoor</SelectItem>
                  <SelectItem value="mixed">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Typical Active Hours</Label>
              <Input value={form.typical_active_hours} onChange={(e) => set("typical_active_hours", e.target.value)} placeholder="07:00–23:00" maxLength={50} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Operating Hours</Label>
              <Input value={form.operating_hours} onChange={(e) => set("operating_hours", e.target.value)} maxLength={200} className="mt-1" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Amenities</Label>
              <Input value={form.amenities} onChange={(e) => set("amenities", e.target.value)} placeholder="Parking, Showers, Café..." maxLength={500} className="mt-1" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Parking Info</Label>
              <Input value={form.parking_info} onChange={(e) => set("parking_info", e.target.value)} maxLength={300} className="mt-1" />
            </div>
          </div>

          <SectionTitle>Contact Details</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Email</Label>
              <Input type="email" value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} maxLength={200} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input value={form.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} maxLength={30} className="mt-1" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Website</Label>
              <Input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://..." maxLength={300} className="mt-1" />
            </div>
          </div>

          <SectionTitle>Admin Notes</SectionTitle>
          <Textarea value={form.notes_for_admin} onChange={(e) => set("notes_for_admin", e.target.value)} maxLength={1000} className="min-h-[60px]" placeholder="Internal notes..." />
        </div>

        <div className="flex gap-2 mt-4 pt-4 border-t border-border/30">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancel</Button>
          {!club && (
            <Button variant="secondary" onClick={() => handleSave(true)} disabled={saving} className="flex-1 gap-1.5">
              <Plus className="w-4 h-4" /> Save & Add Another
            </Button>
          )}
          <Button onClick={() => handleSave(false)} disabled={saving} className="flex-1 gap-1.5">
            <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Club"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ClubFormModal;
