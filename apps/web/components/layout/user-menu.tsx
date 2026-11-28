"use client";

import Link from "next/link";
import { History, LogOut, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CurrentUser } from "@/lib/auth/session";
import { initials } from "@/lib/format";
import { logoutAction } from "@/lib/api/auth-actions";
import { canManageTeam, roleLabel } from "@broker-notes/shared/orgs/roles";

export function UserMenu({ user }: { user: CurrentUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="size-10 rounded-full p-0"
          aria-label={`Account menu for ${user.name}`}
        >
          <span className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-full text-xs font-semibold">
            {initials(user.name)}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="text-muted-foreground truncate text-xs">{user.email}</p>
          {user.organisationName ? (
            <p className="text-muted-foreground mt-1.5 truncate text-xs">
              {user.organisationName} ·{" "}
              <span className="text-foreground font-medium">{roleLabel(user.role)}</span>
            </p>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="min-h-10 cursor-pointer">
          <Link href="/settings/team">
            <UsersRound className="size-4" aria-hidden />
            Team
          </Link>
        </DropdownMenuItem>
        {canManageTeam(user) ? (
          <DropdownMenuItem asChild className="min-h-10 cursor-pointer">
            <Link href="/settings/audit">
              <History className="size-4" aria-hidden />
              Audit log
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <form action={logoutAction}>
          <DropdownMenuItem asChild className="min-h-10 cursor-pointer">
            <button type="submit" className="w-full">
              <LogOut className="size-4" aria-hidden />
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
