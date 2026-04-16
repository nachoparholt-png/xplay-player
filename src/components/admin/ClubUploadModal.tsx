import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type ParsedRow = Record<string, string>;
type RowError = { row: number; field: string; message: string };

const VALID_COURT_TYPES = ["indoor", "outdoor", "mixed"];
const VALID_STATUSES = ["active", "inactive"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: () => void;
}

// --- Flexible column detection ---
function normalizeColumnName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-\/\s]+/g, " ")
    .trim();
}

function findColumnIndex(headers: string[], possibleNames: string[]): number {
  const normalizedHeaders = headers.map((h) => h ? normalizeColumnName(String(h)) : "");
  const normalizedNames = possibleNames.map(normalizeColumnName);

  for (const name of normalizedNames) {
    const idx = normalizedHeaders.indexOf(name);
    if (idx !== -1) return idx;
  }
  for (const name of normalizedNames) {
    const idx = normalizedHeaders.findIndex((h) => h.startsWith(name));
    if (idx !== -1) return idx;
  }
  for (const name of normalizedNames) {
    const idx = normalizedHeaders.findIndex((h) => h.includes(name));
    if (idx !== -1) return idx;
  }
  return -1;
}

const FIELD_ALIASES: Record<string, string[]> = {
  club_name: ["club_name", "club name", "club / venue", "club/venue", "venue name", "venue", "club"],
  approximate_location: ["approximate_location", "approx location", "approx. location", "location", "approx location (london)"],
  city: ["city", "location city"],
  region: ["region", "county", "state"],
  country: ["country"],
  address_line_1: ["address_line_1", "address line 1", "address"],
  postcode: ["postcode", "postal code", "zip", "zip code"],
  latitude: ["latitude", "lat"],
  longitude: ["longitude", "lng", "lon", "long"],
  number_of_courts: ["number_of_courts", "number of courts", "courts", "courts (no.)", "courts no", "no of courts"],
  main_court_type: ["main_court_type", "main court type", "court type", "indoor / outdoor", "indoor/outdoor", "indoor outdoor"],
  typical_active_hours: ["typical_active_hours", "typical active hours", "active hours", "hours"],
  club_status: ["club_status", "club status", "status"],
  club_description: ["club_description", "club description", "description"],
  amenities: ["amenities"],
  contact_email: ["contact_email", "contact email", "email"],
  contact_phone: ["contact_phone", "contact phone", "phone", "telephone"],
  website: ["website", "url", "web"],
  operating_hours: ["operating_hours", "operating hours"],
  parking_info: ["parking_info", "parking info", "parking"],
  notes_for_admin: ["notes_for_admin", "notes for admin", "admin notes", "notes"],
};

function mapRowsFromSheet(rawRows: any[], headers: string[]): ParsedRow[] {
  const columnMap: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const idx = findColumnIndex(headers, aliases);
    if (idx !== -1) columnMap[field] = idx;
  }

  return rawRows.map((row) => {
    const mapped: ParsedRow = {};
    for (const [field, colIdx] of Object.entries(columnMap)) {
      const val = row[colIdx];
      mapped[field] = val != null ? String(val).trim() : "";
    }
    return mapped;
  });
}

const ClubUploadModal = ({ open, onOpenChange, onUploaded }: Props) => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [errors, setErrors] = useState<RowError[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");

  const reset = () => {
    setRows([]);
    setErrors([]);
    setFileName("");
    setStep("upload");
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const XLSX = await import("xlsx");
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const ws = wb.Sheets[wb.SheetNames[0]];

    // Get raw data as array of arrays to handle flexible headers
    const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

    if (aoa.length < 2) {
      toast({ title: "Empty file", description: "No data rows found in the spreadsheet.", variant: "destructive" });
      return;
    }

    const headers = aoa[0].map((h: any) => String(h));
    const dataRows = aoa.slice(1).filter((row) => row.some((cell: any) => cell != null && String(cell).trim() !== ""));
    const mapped = mapRowsFromSheet(dataRows, headers);

    if (mapped.length === 0) {
      toast({ title: "Empty file", description: "No data rows found in the spreadsheet.", variant: "destructive" });
      return;
    }

    // Validate
    const errs: RowError[] = [];
    const seenNames = new Set<string>();

    mapped.forEach((row, idx) => {
      const rowNum = idx + 2;
      if (!row.club_name) errs.push({ row: rowNum, field: "club_name", message: "Club name is missing" });
      if (!row.approximate_location) errs.push({ row: rowNum, field: "approximate_location", message: "Approximate location is missing" });

      const courts = row.number_of_courts;
      if (courts && (isNaN(Number(courts)) || Number(courts) < 1)) {
        errs.push({ row: rowNum, field: "number_of_courts", message: "Must be a positive number" });
      }

      const ct = row.main_court_type?.toLowerCase();
      if (ct && !VALID_COURT_TYPES.includes(ct)) {
        errs.push({ row: rowNum, field: "main_court_type", message: "Must be indoor, outdoor, or mixed" });
      }

      const st = row.club_status?.toLowerCase();
      if (st && !VALID_STATUSES.includes(st)) {
        errs.push({ row: rowNum, field: "club_status", message: "Must be active or inactive" });
      }

      const lat = row.latitude;
      if (lat && (isNaN(Number(lat)) || Math.abs(Number(lat)) > 90)) {
        errs.push({ row: rowNum, field: "latitude", message: "Invalid latitude" });
      }

      const lng = row.longitude;
      if (lng && (isNaN(Number(lng)) || Math.abs(Number(lng)) > 180)) {
        errs.push({ row: rowNum, field: "longitude", message: "Invalid longitude" });
      }

      const name = row.club_name?.toLowerCase();
      if (name && seenNames.has(name)) {
        errs.push({ row: rowNum, field: "club_name", message: "Duplicate club name in file" });
      }
      if (name) seenNames.add(name);
    });

    setRows(mapped);
    setErrors(errs);
    setStep("preview");
  };

  const handleImport = async () => {
    if (errors.length > 0) {
      toast({ title: "Fix errors first", description: "Resolve validation errors before importing.", variant: "destructive" });
      return;
    }

    setImporting(true);
    let success = 0;
    let failed = 0;

    for (const row of rows) {
      const payload: any = {
        club_name: row.club_name,
        approximate_location: row.approximate_location,
        city: row.city || "",
        region: row.region || "",
        country: row.country || "",
        address_line_1: row.address_line_1 || "",
        postcode: row.postcode || "",
        latitude: row.latitude ? parseFloat(row.latitude) : null,
        longitude: row.longitude ? parseFloat(row.longitude) : null,
        number_of_courts: row.number_of_courts ? parseInt(row.number_of_courts) : 1,
        main_court_type: row.main_court_type?.toLowerCase() || "indoor",
        typical_active_hours: row.typical_active_hours || "07:00–23:00",
        club_status: row.club_status?.toLowerCase() || "active",
        club_description: row.club_description || null,
        amenities: row.amenities || null,
        contact_email: row.contact_email || null,
        contact_phone: row.contact_phone || null,
        website: row.website || null,
        operating_hours: row.operating_hours || null,
        parking_info: row.parking_info || null,
        notes_for_admin: row.notes_for_admin || null,
      };

      const { error } = await supabase.from("clubs").upsert(payload, { onConflict: "club_name" });
      if (error) {
        console.error(`Failed to import "${row.club_name}":`, error.message);
        failed++;
      } else {
        success++;
      }
    }

    toast({
      title: "Import complete",
      description: `${success} clubs imported${failed > 0 ? `, ${failed} failed` : ""}.`,
    });
    setStep("done");
    setImporting(false);
    onUploaded();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" /> Bulk Upload Clubs
          </DialogTitle>
          <DialogDescription>Upload an Excel file (.xlsx) to import clubs in bulk.</DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4 mt-4">
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-border/50 rounded-xl p-10 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
            >
              <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
              <p className="font-medium text-sm">Click to upload .xlsx file</p>
              <p className="text-xs text-muted-foreground mt-1">Or drag and drop</p>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">{fileName}</span>
                <Badge variant="secondary">{rows.length} rows</Badge>
              </div>
              <Button size="sm" variant="ghost" onClick={reset}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            {errors.length > 0 && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-destructive font-medium text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  {errors.length} validation error{errors.length > 1 ? "s" : ""} found
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {errors.map((err, i) => (
                    <p key={i} className="text-xs text-destructive/80">
                      Row {err.row}: <span className="font-medium">{err.field}</span> — {err.message}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {errors.length === 0 && (
              <div className="bg-win/10 border border-win/30 rounded-xl p-4 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-win" />
                <span className="text-sm font-medium">All rows validated successfully</span>
              </div>
            )}

            <div className="overflow-x-auto max-h-60 rounded-lg border border-border/30">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">#</th>
                    <th className="px-3 py-2 text-left font-semibold">Club Name</th>
                    <th className="px-3 py-2 text-left font-semibold">Location</th>
                    <th className="px-3 py-2 text-center font-semibold">Courts</th>
                    <th className="px-3 py-2 text-center font-semibold">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((row, i) => (
                    <tr key={i} className="border-t border-border/20">
                      <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-1.5 font-medium">{row.club_name || <span className="text-destructive italic">missing</span>}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{row.approximate_location || <span className="text-destructive italic">missing</span>}</td>
                      <td className="px-3 py-1.5 text-center">{row.number_of_courts || "1"}</td>
                      <td className="px-3 py-1.5 text-center capitalize">{row.main_court_type || "indoor"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={reset} className="flex-1">Cancel</Button>
              <Button onClick={handleImport} disabled={importing || errors.length > 0} className="flex-1 gap-1.5">
                <Upload className="w-4 h-4" />
                {importing ? "Importing..." : `Import ${rows.length} Clubs`}
              </Button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="text-center py-8">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-win" />
            <p className="font-display font-bold text-lg">Import Complete</p>
            <p className="text-sm text-muted-foreground mt-1">Your clubs have been added to the database.</p>
            <Button onClick={() => { reset(); onOpenChange(false); }} className="mt-4">Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ClubUploadModal;
