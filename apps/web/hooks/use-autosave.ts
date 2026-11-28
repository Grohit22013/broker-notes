"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { nextSaveDelay } from "@/lib/autosave";

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

type SaveFn<T> = (value: T) => Promise<{ ok: true } | { ok: false; error: string }>;

/**
 * Debounced autosave that doesn't lose work:
 * - each change waits `delay` ms of quiet before saving…
 * - …but never longer than `maxWait` ms while the broker keeps typing;
 * - only one save is in flight at a time — changes made meanwhile are saved right after;
 * - saves immediately when the tab is hidden (app switch, phone locked, tab closed);
 * - flushes on unmount and warns before leaving with unsaved changes.
 */
export function useAutosave<T>({
  save,
  delay = 1500,
  maxWait = 5000,
}: {
  save: SaveFn<T>;
  delay?: number;
  maxWait?: number;
}) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

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
    if (inFlight.current || !pendingValue.current) return;
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
      if (pendingValue.current && !timer.current) {
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
      setStatus("pending");
      if (timer.current) clearTimeout(timer.current);
      const wait = nextSaveDelay({ firstPendingAt: firstPendingAt.current, now, delay, maxWait });
      timer.current = setTimeout(() => void run(), wait);
    },
    [delay, maxWait, run],
  );

  /** Save any queued value immediately (Ctrl+S, retry, tab hidden). */
  const flush = useCallback(() => {
    void run();
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

  return { status, error, lastSavedAt, schedule, flush };
}
