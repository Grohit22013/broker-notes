/**
 * How long to wait before the next autosave.
 *
 * A plain debounce restarts on every keystroke, so someone typing steadily would never be
 * saved. `maxWait` caps that: once changes have been pending for `maxWait` ms, save now.
 */
export function nextSaveDelay({
  firstPendingAt,
  now,
  delay,
  maxWait,
}: {
  firstPendingAt: number;
  now: number;
  delay: number;
  maxWait: number;
}): number {
  const remaining = maxWait - (now - firstPendingAt);
  return Math.max(0, Math.min(delay, remaining));
}
