import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Download, AlertTriangle, CheckCircle, Loader2, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

type Reward = { id: string; reward_name: string };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rewards: Reward[];
  preselectedRewardId: string | null;
  onImported: () => void;
}

type ImportRow = {
  rowNum: number;
  reward_id: string;
  unique_code: string;
  source_reference?: string;
  expiration_date?: string;
  admin_note?: string;
  error?: string;
};

const BulkImportModal = ({ open, onOpenChange, rewards, preselectedRewardId, onImported }: Props) => {
  const [selectedRewardId, setSelectedRewardId] = useState(preselectedRewardId || "");
  const [parsedRows, setParsedRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const codeBasedRewards = rewards.filter((r) => r.code_required);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const wb = XLSX.read(event.target?.result, { type: "binary" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const jsonData: any[] = XLSX.utils.sheet_to_json(sheet);

        const rows: ImportRow[] = jsonData.map((row, i) => {
          const rewardId = selectedRewardId || row.reward_id || "";
          const code = (row.unique_code || row.code || "").toString().trim();

          let error: string | undefined;
          if (!code) error = "Code value missing";
          if (!rewardId) error = "No reward selected";
          if (rewardId && !rewards.find((r) => r.id === rewardId)) error = "Reward not found";

          return {
            rowNum: i + 2,
            reward_id: rewardId,
            unique_code: code,
            source_reference: (row.source_reference || "").toString(),
            expiration_date: (row.expiration_date || "").toString(),
            admin_note: (row.admin_note || "").toString(),
            error,
          };
        });

        // Check duplicates within file
        const seen = new Set<string>();
        rows.forEach((r) => {
          const key = `${r.reward_id}:${r.unique_code}`;
          if (seen.has(key) && !r.error) r.error = "Duplicate code in file";
          seen.add(key);
        });

        setParsedRows(rows);
        setImportResult(null);
      } catch {
        toast({ title: "Failed to parse file", variant: "destructive" });
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleImport = async () => {
    const valid = parsedRows.filter((r) => !r.error);
    if (valid.length === 0) {
      toast({ title: "No valid rows to import", variant: "destructive" });
      return;
    }

    setImporting(true);
    let success = 0;
    let failed = 0;

    for (const row of valid) {
      const { error } = await supabase.from("reward_codes").insert({
        reward_id: row.reward_id,
        unique_code: row.unique_code,
        source_reference: row.source_reference || null,
        expiration_date: row.expiration_date || null,
        admin_note: row.admin_note || null,
      });

      if (error) {
        row.error = error.message.includes("unique") ? "Duplicate code" : error.message;
        failed++;
      } else {
        success++;
      }
    }

    setImportResult({ success, failed });
    setParsedRows([...parsedRows]);
    setImporting(false);
    toast({ title: `Import complete: ${success} added, ${failed} failed` });
    if (success > 0) onImported();
  };

  const downloadTemplate = () => {
    const template = [{ reward_id: "", unique_code: "", source_reference: "", expiration_date: "", admin_note: "" }];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Codes");
    XLSX.writeFile(wb, "reward_codes_template.xlsx");
  };

  const errorCount = parsedRows.filter((r) => r.error).length;
  const validCount = parsedRows.filter((r) => !r.error).length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setParsedRows([]); setImportResult(null); } onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" />
            Bulk Import Codes
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Target Reward</label>
            <select
              value={selectedRewardId}
              onChange={(e) => setSelectedRewardId(e.target.value)}
              className="w-full h-10 rounded-xl border border-border bg-muted/50 px-3 text-sm"
            >
              <option value="">Select reward (or include reward_id in file)</option>
              {codeBasedRewards.map((r) => <option key={r.id} value={r.id}>{r.reward_name}</option>)}
            </select>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-1.5">
              <Download className="w-3.5 h-3.5" />
              Download Template
            </Button>
            <Button size="sm" onClick={() => fileRef.current?.click()} className="gap-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Upload File
            </Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
          </div>

          {parsedRows.length > 0 && (
            <>
              <div className="flex items-center gap-3 text-sm">
                <span className="flex items-center gap-1 text-primary">
                  <CheckCircle className="w-4 h-4" /> {validCount} valid
                </span>
                {errorCount > 0 && (
                  <span className="flex items-center gap-1 text-destructive">
                    <AlertTriangle className="w-4 h-4" /> {errorCount} errors
                  </span>
                )}
              </div>

              <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl border border-border p-2">
                {parsedRows.slice(0, 50).map((row) => (
                  <div key={row.rowNum} className={`flex items-center justify-between p-2 rounded-lg text-xs ${row.error ? "bg-destructive/5" : "bg-muted/30"}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-muted-foreground w-8 shrink-0">#{row.rowNum}</span>
                      <code className="font-mono truncate">{row.unique_code || "(empty)"}</code>
                    </div>
                    {row.error && <span className="text-destructive text-[10px] shrink-0">{row.error}</span>}
                  </div>
                ))}
              </div>

              {!importResult && (
                <Button onClick={handleImport} disabled={importing || validCount === 0} className="w-full gap-2">
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Import {validCount} Codes
                </Button>
              )}

              {importResult && (
                <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-center">
                  <p className="text-sm font-medium">Import complete</p>
                  <p className="text-xs text-muted-foreground">{importResult.success} added, {importResult.failed} failed</p>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BulkImportModal;
