"use client";

import { AlertTriangle, History } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";

/** Shown when a save was refused because the note changed in another tab or by a colleague. */
export function ConflictBanner({
  updatedAt,
  onLoadTheirs,
  onKeepMine,
}: {
  updatedAt: string;
  onLoadTheirs: () => void;
  onKeepMine: () => void;
}) {
  return (
    <div
      role="alert"
      className="mb-4 grid gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <p className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          <strong>This note was changed elsewhere</strong> (another tab or a colleague, saved{" "}
          {formatDateTime(new Date(updatedAt))}). Your latest edits haven&apos;t been saved yet.
          Which version should be kept?
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="h-9 bg-transparent" onClick={onLoadTheirs}>
          Load their version
        </Button>
        <Button size="sm" className="h-9" onClick={onKeepMine}>
          Keep mine
        </Button>
      </div>
    </div>
  );
}

/** Shown when the browser holds edits for this note that never reached the server. */
export function DraftBanner({
  savedAt,
  stale,
  onRestore,
  onDiscard,
}: {
  savedAt: string;
  stale: boolean;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  return (
    <div role="alert" className="bg-muted mb-4 grid gap-3 rounded-lg border p-3 text-sm">
      <p className="flex items-start gap-2">
        <History className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          <strong>Unsaved changes found</strong> from {formatDateTime(new Date(savedAt))} that
          didn&apos;t reach the server (the tab closed or the connection dropped).
          {stale
            ? " The note has been saved elsewhere since, so restoring replaces the newer version."
            : ""}
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="h-9" onClick={onRestore}>
          Restore my changes
        </Button>
        <Button size="sm" variant="outline" className="h-9" onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </div>
  );
}
