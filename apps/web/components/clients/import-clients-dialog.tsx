"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  guessMapping,
  summariseImport,
  validateImportRows,
  type ColumnMapping,
} from "@broker-notes/shared/clients/validation";
import { cn } from "@/lib/utils";
import { importClientsAction, type ImportResult } from "@/lib/api/actions";

const SKIP = "__skip__";
const PREVIEW_ROWS = 10;

type Parsed = { fileName: string; headers: string[]; rows: Record<string, string>[] };

/**
 * Import clients from a CSV: pick file → map columns → preview with validation → import.
 * The preview runs the same validation as the server, but the server re-checks everything.
 */
export function ImportClientsDialog({ existingEmails }: { existingEmails: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({ name: null, email: null, phone: null });
  const [fileError, setFileError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<ImportResult, { ok: true }> | null>(null);
  const [pending, startTransition] = useTransition();

  const existing = useMemo(() => new Set(existingEmails), [existingEmails]);
  const validation = useMemo(
    () => (parsed && mapping.name ? validateImportRows(parsed.rows, mapping, existing) : []),
    [parsed, mapping, existing],
  );
  const summary = summariseImport(validation);

  const reset = () => {
    setParsed(null);
    setMapping({ name: null, email: null, phone: null });
    setFileError(null);
    setResult(null);
  };

  const onFile = (file: File | undefined) => {
    setResult(null);
    setFileError(null);
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      return setFileError("Please choose a .csv file.");
    }
    if (file.size > IMPORT_MAX_BYTES) return setFileError("That file is larger than 2 MB.");

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.replace(/^﻿/, "").trim(),
      complete: (res) => {
        const headers = (res.meta.fields ?? []).filter(Boolean);
        if (!headers.length) return setFileError("Couldn't find a header row in that file.");
        if (res.data.length === 0) return setFileError("That file has no rows.");
        if (res.data.length > IMPORT_MAX_ROWS) {
          return setFileError(
            `That file has ${res.data.length} rows — the limit is ${IMPORT_MAX_ROWS}.`,
          );
        }
        setParsed({ fileName: file.name, headers, rows: res.data });
        setMapping(guessMapping(headers));
      },
      error: () => setFileError("Couldn't read that file."),
    });
  };

  const runImport = () =>
    startTransition(async () => {
      if (!parsed) return;
      const res = await importClientsAction(parsed.rows, mapping);
      if (!res.ok) return void toast.error(res.error);
      setResult(res);
      toast.success(`Imported ${res.imported} ${res.imported === 1 ? "client" : "clients"}`);
      router.refresh();
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="h-10" aria-label="Import CSV">
          <Upload className="size-4" aria-hidden />
          <span className="hidden sm:inline">Import CSV</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import clients from CSV</DialogTitle>
          <DialogDescription>
            Up to {IMPORT_MAX_ROWS} rows / 2 MB. Clients whose email already exists are skipped, not
            overwritten.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3" role="status">
            <p className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="size-5 text-emerald-600" aria-hidden />
              Imported {result.imported} · skipped {result.duplicates} duplicate
              {result.duplicates === 1 ? "" : "s"} · {result.invalid} invalid
            </p>
            {result.problems.length ? (
              <ul className="bg-muted max-h-48 overflow-y-auto rounded-md p-3 text-sm">
                {result.problems.map((p) => (
                  <li key={p.row}>
                    Row {p.row}: {p.reason}
                  </li>
                ))}
              </ul>
            ) : null}
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-5">
            <label
              htmlFor="import-file"
              className="hover:border-primary/50 flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center"
            >
              <FileUp className="text-primary size-6" aria-hidden />
              <span className="text-sm font-medium">
                {parsed ? parsed.fileName : "Choose a CSV file"}
              </span>
              <span className="text-muted-foreground text-xs">
                Columns like Name, Email, Phone are detected automatically
              </span>
              <input
                id="import-file"
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </label>
            {fileError ? (
              <p className="text-destructive text-sm" role="alert">
                {fileError}
              </p>
            ) : null}

            {parsed ? (
              <>
                <fieldset className="grid gap-3 sm:grid-cols-3">
                  <legend className="mb-2 text-sm font-medium">Match your columns</legend>
                  {(["name", "email", "phone"] as const).map((field) => (
                    <div key={field} className="grid gap-1.5">
                      <Label htmlFor={`map-${field}`} className="text-xs capitalize">
                        {field}
                        {field === "name" ? " (required)" : ""}
                      </Label>
                      <Select
                        value={mapping[field] ?? SKIP}
                        onValueChange={(v) =>
                          setMapping((m) => ({ ...m, [field]: v === SKIP ? null : v }))
                        }
                      >
                        <SelectTrigger id={`map-${field}`} className="h-10 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SKIP}>— Don&apos;t import —</SelectItem>
                          {parsed.headers.map((h) => (
                            <SelectItem key={h} value={h}>
                              {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </fieldset>

                {mapping.name ? (
                  <>
                    <p className="text-sm" aria-live="polite">
                      <strong>{summary.valid}</strong> ready to import ·{" "}
                      <strong>{summary.duplicates}</strong> duplicate ·{" "}
                      <strong>{summary.invalid}</strong> invalid
                      <span className="text-muted-foreground"> (of {parsed.rows.length} rows)</span>
                    </p>
                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full min-w-[32rem] text-sm">
                        <caption className="sr-only">
                          Preview of the first {PREVIEW_ROWS} rows
                        </caption>
                        <thead className="bg-muted text-left">
                          <tr>
                            <th className="px-3 py-2 font-medium">Row</th>
                            <th className="px-3 py-2 font-medium">Name</th>
                            <th className="px-3 py-2 font-medium">Email</th>
                            <th className="px-3 py-2 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {validation.slice(0, PREVIEW_ROWS).map((r) => {
                            const raw = parsed.rows[r.row - 1] ?? {};
                            return (
                              <tr key={r.row} className="border-t">
                                <td className="text-muted-foreground px-3 py-2 tabular-nums">
                                  {r.row}
                                </td>
                                <td className="px-3 py-2">
                                  {mapping.name ? raw[mapping.name] : ""}
                                </td>
                                <td className="px-3 py-2">
                                  {mapping.email ? raw[mapping.email] : ""}
                                </td>
                                <td
                                  className={cn(
                                    "px-3 py-2",
                                    r.status === "invalid" && "text-destructive",
                                    r.status === "duplicate" &&
                                      "text-amber-700 dark:text-amber-400",
                                  )}
                                >
                                  {r.status === "valid" ? (
                                    "Ready"
                                  ) : (
                                    <span className="inline-flex items-center gap-1">
                                      <AlertTriangle className="size-3.5" aria-hidden />
                                      {r.reason}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <p className="text-destructive text-sm">Choose which column holds the name.</p>
                )}
              </>
            ) : null}

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={runImport}
                disabled={!parsed || !mapping.name || summary.valid === 0 || pending}
              >
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Import {summary.valid || ""} {summary.valid === 1 ? "client" : "clients"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
