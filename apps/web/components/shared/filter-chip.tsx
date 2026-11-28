import { cn } from "@/lib/utils";

/**
 * A filter chip for server-rendered list pages (cases, tasks, audit log).
 *
 * Deliberately a plain `<a>`, not `next/link`: in production builds, client-side navigations that
 * only change the query string of these pages intermittently never commit (the RSC response
 * arrives but the router doesn't apply it; dev mode is unaffected). A normal page load is
 * reliable, and these pages are server-rendered anyway. See SCRATCHPAD "Open issues".
 */
export function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-sm font-medium transition-colors",
        active ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent",
      )}
    >
      {children}
    </a>
  );
}
