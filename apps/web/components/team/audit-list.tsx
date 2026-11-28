"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Briefcase,
  Download,
  FileText,
  History,
  ListTodo,
  Loader2,
  LogIn,
  Sparkles,
  UsersRound,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatDateTime, formatRelative } from "@/lib/format";
import { loadAuditPageAction } from "@/lib/api/org-actions";
import type { AuditEntryDto, AuditPageDto } from "@broker-notes/shared/dto";
import { categoryOf, type AuditCategory } from "@broker-notes/shared/orgs/audit";

const ICONS: Record<AuditCategory, LucideIcon> = {
  note: FileText,
  client: UserRound,
  case: Briefcase,
  task: ListTodo,
  team: UsersRound,
  export: Download,
  ai: Sparkles,
  auth: LogIn,
};

/** Where an entry's subject lives, when it still makes sense to link to it. */
function hrefOf(e: AuditEntryDto): string | null {
  if (!e.entityId) return null;
  if (e.entityType === "note" && e.action !== "note.deleted") return `/notes/${e.entityId}`;
  if (e.entityType === "client") return `/clients/${e.entityId}`;
  if (e.entityType === "case") return `/cases/${e.entityId}`;
  return null;
}

export function AuditList({ initial, category }: { initial: AuditPageDto; category?: string }) {
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [pending, startTransition] = useTransition();

  const more = () =>
    cursor &&
    startTransition(async () => {
      const res = await loadAuditPageAction(category, cursor);
      if (!res.ok) return void toast.error(res.error);
      setItems((list) => [...list, ...res.data.items]);
      setCursor(res.data.nextCursor);
    });

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground bg-card flex items-center gap-2 rounded-xl border p-4 text-sm">
        <History className="size-4" aria-hidden /> Nothing recorded yet.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 pb-10">
      <ol className="bg-card divide-y rounded-xl border">
        {items.map((e) => {
          const Icon = ICONS[categoryOf(e.action) ?? "note"];
          const href = hrefOf(e);
          const when = new Date(e.createdAt);
          return (
            <li key={e.id} className="flex gap-3 p-4">
              <span className="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-full">
                <Icon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-medium">{e.user?.name ?? "Former member"}</span>{" "}
                  <span className="text-muted-foreground">·</span>{" "}
                  {href ? (
                    <Link href={href} className="underline-offset-4 hover:underline">
                      {e.summary}
                    </Link>
                  ) : (
                    e.summary
                  )}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  <time dateTime={e.createdAt} title={formatDateTime(when)}>
                    {formatRelative(when)}
                  </time>{" "}
                  · <code className="text-[0.7rem]">{e.action}</code>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {cursor ? (
        <Button
          variant="outline"
          className="h-10 justify-self-center"
          onClick={more}
          disabled={pending}
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Load older entries
        </Button>
      ) : (
        <p className="text-muted-foreground text-center text-xs">That&apos;s everything.</p>
      )}
    </div>
  );
}
