"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { nextSaveDelay } from "@/lib/autosave";

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error" | "conflict";

type SaveFn<T, C> = (
  value: T,
) => Promise<{ ok: true } | { ok: false; error: string; conflict?: C }>;

/**
 * Debounced autosave that doesn't lose work:
 * - each change waits `delay` ms of quiet before saving…
 * - …but never longer than `maxWait` ms while the broker keeps typing;
 * - only one save is in flight at a time — changes made meanwhile are saved right after;
 * - saves immediately when the tab is hidden (app switch, phone locked, tab closed);
 * - flushes on unmount and warns before leaving with unsaved changes;
 * - on a conflict (the note changed elsewhere) it stops, keeps the edits, and waits for
 *   `resolveConflict` — it never retries into someone else's changes on its own.
 */
export function useAutosave<T, C = unknown>({
  save,
  delay = 1500,
  maxWait = 5000,
}: {
  save: SaveFn<T, C>;
  delay?: number;
  maxWait?: number;
}) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [conflict, setConflict] = useState<C | null>(null);
  const paused = useRef(false);

  const saveRef = useRef(save);
  const pendingValue = useRef<{ value: T } | null>(null);
  const firstPendingAt = useRef<number | null>(null);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const run = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (paused.current || inFlight.current || !pendingValue.current) return;
    const { value } = pendingValue.current;
    pendingValue.current = null;
    firstPendingAt.current = null;
    inFlight.current = true;
    setStatus("saving");
    try {
      const res = await saveRef.current(value);
      if (res.ok) {
        setError(null);
        setLastSavedAt(new Date());
        setStatus(pendingValue.current ? "pending" : "saved");
      } else if (res.conflict) {
        // Keep the unsaved edits (newer ones win) and stop until the user decides.
        pendingValue.current ??= { value };
        paused.current = true;
        setConflict(res.conflict);
        setError(res.error);
        setStatus("conflict");
      } else {
        setError(res.error);
        setStatus("error");
      }
    } catch {
      // Keep the value so a retry (or the next change) saves it.
      pendingValue.current ??= { value };
      setError("Couldn't save. Check your connection.");
      setStatus("error");
    } finally {
      inFlight.current = false;
      if (pendingValue.current && !timer.current && !paused.current) {
        // Changes arrived while saving: save them on the normal cadence.
        timer.current = setTimeout(() => void run(), delay);
      }
    }
  }, [delay]);

  /** Queue a value to be saved. */
  const schedule = useCallback(
    (value: T) => {
      const now = Date.now();
      pendingValue.current = { value };
      firstPendingAt.current ??= now;
      if (paused.current) return; // keep collecting edits while a conflict is open
      setStatus("pending");
      if (timer.current) clearTimeout(timer.current);
      const wait = nextSaveDelay({ firstPendingAt: firstPendingAt.current, now, delay, maxWait });
      timer.current = setTimeout(() => void run(), wait);
    },
    [delay, maxWait, run],
  );

  /** Save any queued value immediately (Ctrl+S, retry, tab hidden). */
  /**
   * Saves any queued value now and resolves once nothing is pending or in flight.
   * Callers that must see the saved text (finalise, AI analysis) await this: plain fetch
   * requests run in parallel, so without it a follow-up request could overtake the last save.
   */
  const flush = useCallback(async () => {
    void run();
    const deadline = Date.now() + 15_000;
    while (!paused.current && (inFlight.current || pendingValue.current) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
      if (!inFlight.current && pendingValue.current) void run();
    }
  }, [run]);

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") void run();
    };
    const onPageHide = () => void run();
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingValue.current || inFlight.current) e.preventDefault();
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (timer.current) clearTimeout(timer.current);
      // Client-side navigation away (e.g. back to the list): save what's left.
      if (pendingValue.current) void saveRef.current(pendingValue.current.value);
    };
  }, [run]);

  /**
   * Ends a conflict. "keep": save the pending edits now (the caller has moved its base revision
   * to the latest one). "discard": drop them (the caller has loaded the other version).
   */
  const resolveConflict = useCallback(
    (choice: "keep" | "discard") => {
      paused.current = false;
      setConflict(null);
      setError(null);
      if (choice === "discard") {
        pendingValue.current = null;
        firstPendingAt.current = null;
        setStatus("saved");
        return;
      }
      void run();
    },
    [run],
  );

  return { status, error, lastSavedAt, schedule, flush, conflict, resolveConflict };
}
