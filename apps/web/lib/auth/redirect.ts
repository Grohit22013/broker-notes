export const DEFAULT_AUTHED_PATH = "/dashboard";

/**
 * Only allow same-site relative paths as post-login redirects.
 * Blocks open redirects like `https://evil.com`, `//evil.com` and `/\evil.com`.
 */
export function safeRedirect(target: unknown, fallback: string = DEFAULT_AUTHED_PATH): string {
  if (typeof target !== "string" || target.length === 0) return fallback;
  if (!target.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) {
    return fallback;
  }
  // Never bounce back to the auth pages themselves.
  if (/^\/(login|register)(\/|\?|$)/.test(target)) return fallback;
  return target;
}
