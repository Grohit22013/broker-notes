"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotebookPen } from "lucide-react";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import type { CurrentUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { isActivePath, mainNav, siteConfig } from "@/lib/site";

export function AppHeader({ user }: { user: CurrentUser | null }) {
  const pathname = usePathname();

  return (
    <header className="bg-background/80 pt-safe supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 border-b backdrop-blur">
      <div className="container-page flex h-14 items-center gap-6">
        <Link
          href={user ? "/dashboard" : "/"}
          className="flex items-center gap-2 font-semibold tracking-tight"
          aria-label={`${siteConfig.name} home`}
        >
          <span className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-lg">
            <NotebookPen className="size-4" aria-hidden />
          </span>
          <span>{siteConfig.name}</span>
        </Link>

        {/* Desktop navigation; on mobile the BottomNav takes over */}
        {user ? (
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {mainNav.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/60",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        ) : null}

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          {user ? (
            <UserMenu user={user} />
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="h-10">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm" className="hidden h-10 sm:inline-flex">
                <Link href="/register">Get started</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
