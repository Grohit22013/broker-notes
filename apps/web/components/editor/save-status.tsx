"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";

import type { SaveStatus } from "@/hooks/use-autosave";
import { cn } from "@/lib/utils";

const LABELS: Record<SaveStatus, string> = {
  idle: "All changes saved",
  pending: "Unsaved changes",
  saving: "Saving…",
  saved: "Saved",
  error: "Not saved",
  conflict: "Not saved: changed elsewhere",
};

export function SaveStatusIndicator({
  status,
  error,
  onRetry,
}: {
  status: SaveStatus;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-1.5 text-xs whitespace-nowrap",
        status === "error" || status === "conflict" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {status === "saving" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
      {status === "saved" || status === "idle" ? <Check className="size-3.5" aria-hidden /> : null}
      {status === "pending" ? (
        <span className="bg-muted-foreground size-1.5 rounded-full" aria-hidden />
      ) : null}
      {status === "error" || status === "conflict" ? (
        <AlertCircle className="size-3.5" aria-hidden />
      ) : null}
      <span>{status === "error" && error ? error : LABELS[status]}</span>
      {status === "error" ? (
        <button
          type="button"
          onClick={onRetry}
          className="font-medium underline underline-offset-2"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
