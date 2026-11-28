"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime } from "@/lib/format";
import { createInviteAction, inviteUrl, revokeInviteAction } from "@/lib/api/org-actions";
import type { InviteDto, RoleValue } from "@broker-notes/shared/dto";
import { INVITE_TTL_DAYS, ROLES, roleLabel } from "@broker-notes/shared/orgs/roles";

/** Admin-only: invite people by link, and see/revoke pending invites. */
export function InvitesSection({ invites }: { invites: InviteDto[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const revoke = (i: InviteDto) =>
    startTransition(async () => {
      const res = await revokeInviteAction(i.id);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Invite for ${i.email} revoked`);
      router.refresh();
    });

  return (
    <section aria-labelledby="invites-title" className="grid min-w-0 grid-cols-1 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="invites-title" className="text-lg font-semibold">
          Pending invites
        </h2>
        <InviteDialog />
      </div>
      {invites.length === 0 ? (
        <p className="text-muted-foreground bg-card rounded-xl border p-4 text-sm">
          No pending invites. Invite advisers and case managers to share clients and notes.
        </p>
      ) : (
        <ul className="bg-card divide-y rounded-xl border">
          {invites.map((i) => (
            <li key={i.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  <span className="truncate">{i.email}</span>
                  <Badge variant="outline">{roleLabel(i.role)}</Badge>
                  {i.expired ? <Badge variant="destructive">Expired</Badge> : null}
                </p>
                <p className="text-muted-foreground text-xs">
                  Invited by {i.invitedBy} · {i.expired ? "expired" : "expires"}{" "}
                  {formatDateTime(new Date(i.expiresAt))}
                </p>
              </div>
              <Button
                variant="outline"
                className="h-10 self-start sm:self-center"
                disabled={pending}
                onClick={() => revoke(i)}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function InviteDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<RoleValue>("ADVISER");
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setError(null);
    setLink(null);
    setCopied(false);
    setRole("ADVISER");
  };

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "");
    startTransition(async () => {
      const res = await createInviteAction({ email, role });
      if (!res.ok) return setError(res.error);
      setError(null);
      setLink(inviteUrl(res.data.token));
      router.refresh();
    });
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Invite link copied");
    } catch {
      toast.error("Couldn't copy — select the link and copy it manually.");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="h-10">
          <UserPlus className="size-4" aria-hidden /> Invite member
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {link ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>Invite link ready</DialogTitle>
              <DialogDescription>
                Send this link to them yourself (for example by email). It works once and expires in{" "}
                {INVITE_TTL_DAYS} days. For security it won&apos;t be shown again.
              </DialogDescription>
            </DialogHeader>
            <div className="grid min-w-0 grid-cols-1 gap-2">
              <Label htmlFor="invite-link">Invite link</Label>
              <Input
                id="invite-link"
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                className="h-11 font-mono text-xs"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Done
              </Button>
              <Button type="button" onClick={copy}>
                {copied ? (
                  <Check className="size-4" aria-hidden />
                ) : (
                  <Copy className="size-4" aria-hidden />
                )}
                {copied ? "Copied" : "Copy link"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>Invite a team member</DialogTitle>
              <DialogDescription>
                They&apos;ll join your brokerage with the role you choose.
              </DialogDescription>
            </DialogHeader>
            <div className="grid min-w-0 grid-cols-1 gap-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                name="email"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                required
                autoFocus
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "invite-error" : undefined}
                className="h-11 text-base md:text-sm"
              />
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-2">
              <Label htmlFor="invite-role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as RoleValue)}>
                <SelectTrigger id="invite-role" className="h-11 w-full">
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
              <p className="text-muted-foreground text-xs">
                {ROLES.find((r) => r.value === role)?.description}
              </p>
            </div>
            {error ? (
              <p id="invite-error" role="alert" className="text-destructive text-sm">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Create invite link
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
