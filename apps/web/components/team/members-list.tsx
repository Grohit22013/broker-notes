"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime, initials } from "@/lib/format";
import { updateMemberAction } from "@/lib/api/org-actions";
import { cn } from "@/lib/utils";
import type { MemberDto, RoleValue } from "@broker-notes/shared/dto";
import { ROLES, roleLabel } from "@broker-notes/shared/orgs/roles";

type Props = { members: MemberDto[]; currentUserId: string; canManage: boolean };

/** The brokerage's members. Admins can change roles and (de)activate people. */
export function MembersList({ members, currentUserId, canManage }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<MemberDto | null>(null);

  const change = (m: MemberDto, patch: { role?: RoleValue; active?: boolean }, done: string) =>
    startTransition(async () => {
      const res = await updateMemberAction(m.id, patch);
      if (!res.ok) return void toast.error(res.error);
      toast.success(done);
      router.refresh();
    });

  return (
    <>
      <ul className="bg-card divide-y rounded-xl border">
        {members.map((m) => {
          const you = m.id === currentUserId;
          return (
            <li
              key={m.id}
              className={cn(
                "flex flex-col gap-3 p-4 sm:flex-row sm:items-center",
                !m.active && "opacity-60",
              )}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold">
                  {initials(m.name)}
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="truncate">{m.name}</span>
                    {you ? <Badge variant="secondary">You</Badge> : null}
                    {!m.active ? <Badge variant="outline">Deactivated</Badge> : null}
                  </p>
                  <p className="text-muted-foreground truncate text-sm">{m.email}</p>
                  <p className="text-muted-foreground text-xs">
                    Joined {formatDateTime(new Date(m.joinedAt)).split(",")[0]}
                  </p>
                </div>
              </div>

              {canManage ? (
                <div className="flex items-center gap-2">
                  <Select
                    value={m.role}
                    disabled={pending || !m.active}
                    onValueChange={(v) =>
                      change(
                        m,
                        { role: v as RoleValue },
                        `${m.name} is now ${roleLabel(v as RoleValue)}`,
                      )
                    }
                  >
                    <SelectTrigger className="h-10 w-40" aria-label={`Role for ${m.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {you ? null : m.active ? (
                    <Button
                      variant="outline"
                      className="h-10"
                      disabled={pending}
                      onClick={() => setConfirm(m)}
                    >
                      Deactivate
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="h-10"
                      disabled={pending}
                      onClick={() => change(m, { active: true }, `${m.name} reactivated`)}
                    >
                      Reactivate
                    </Button>
                  )}
                </div>
              ) : (
                <Badge variant="outline" className="self-start sm:self-center">
                  {roleLabel(m.role)}
                </Badge>
              )}
            </li>
          );
        })}
      </ul>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {confirm?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They&apos;ll be signed out straight away and won&apos;t be able to sign in. Their
              notes stay in the brokerage, and you can reactivate them at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm) change(confirm, { active: false }, `${confirm.name} deactivated`);
                setConfirm(null);
              }}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
