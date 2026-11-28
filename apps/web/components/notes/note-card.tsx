"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreVertical, Pin, PinOff, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  FigureBadge,
  FinalisedBadge,
  FollowUpBadge,
  PinnedMark,
  StageBadge,
  TagBadge,
  TypeBadge,
} from "@/components/notes/badges";
import { DeleteNoteDialog } from "@/components/notes/delete-note-dialog";
import { FavouriteButton } from "@/components/notes/favourite-button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDateTime, formatRelative } from "@/lib/format";
import { formatAudCompact } from "@broker-notes/shared/money";
import { displayTitle, matchSnippet, snippet } from "@broker-notes/shared/notes/content";
import type { LoanStageValue, NoteTypeValue } from "@broker-notes/shared/notes/taxonomy";
import { cn } from "@/lib/utils";
import { updateNoteMetaAction } from "@/lib/api/actions";

export type NoteCardData = {
  id: string;
  title: string;
  contentText: string;
  updatedAt: string; // ISO — serialisable across the server/client boundary
  noteType: NoteTypeValue;
  loanStage: LoanStageValue | null;
  tags: string[];
  followUpAt: string | null;
  pinned: boolean;
  finalised: boolean;
  clientName: string | null;
  caseReference: string | null;
  /** Starred by the viewer. */
  favourite: boolean;
  loanAmount: number | null;
  lvr: number | null;
  /** Shown when someone else wrote the note (null for the viewer's own notes). */
  authorName: string | null;
  /** Whether the viewer may pin/delete it (author or admin). */
  canEdit: boolean;
};

const MAX_TAGS_SHOWN = 3;

export function NoteCard({
  note,
  query = "",
  hideClient = false,
  hideCase = false,
}: {
  note: NoteCardData;
  query?: string;
  /** On a client page the client name is redundant. */
  hideClient?: boolean;
  /** On a case page the case reference is redundant. */
  hideCase?: boolean;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pinPending, startPin] = useTransition();
  const shownTitle = displayTitle(note.title);
  const updated = new Date(note.updatedAt);
  const match = matchSnippet(note.contentText, query);
  const preview = match ? null : snippet(note.contentText);

  const togglePin = () =>
    startPin(async () => {
      const res = await updateNoteMetaAction({ id: note.id, pinned: !note.pinned });
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.meta.pinned ? "Pinned to top" : "Unpinned");
      router.refresh();
    });

  return (
    <li
      className={cn(
        "group bg-card hover:border-primary/40 focus-within:ring-ring/50 relative flex flex-col rounded-xl border transition-colors focus-within:ring-2",
        note.pinned && "border-primary/30",
        pinPending && "opacity-60",
      )}
    >
      {/* The whole card is a link; the menu button sits above it. */}
      <Link
        href={`/notes/${note.id}`}
        className="flex flex-1 flex-col rounded-xl p-4 pr-24 outline-none md:p-5 md:pr-24"
        aria-label={`Open note: ${shownTitle}`}
      >
        <div className="flex items-center gap-1.5">
          {note.pinned ? <PinnedMark /> : null}
          <h2 className="line-clamp-1 font-medium">
            <Highlight text={shownTitle} query={query} />
          </h2>
        </div>
        {(note.clientName && !hideClient) || (note.caseReference && !hideCase) ? (
          <p className="mt-0.5 flex min-w-0 items-center gap-2 text-sm">
            {note.clientName && !hideClient ? (
              <span className="text-primary truncate font-medium">
                <Highlight text={note.clientName} query={query} />
              </span>
            ) : null}
            {note.caseReference && !hideCase ? (
              <span className="text-muted-foreground shrink-0 font-mono text-xs">
                <Highlight text={note.caseReference} query={query} />
              </span>
            ) : null}
          </p>
        ) : null}

        <p className="text-muted-foreground mt-1 line-clamp-2 min-h-10 text-sm">
          {match ? (
            <>
              {match.before}
              <mark className="rounded-sm bg-amber-200/70 px-0.5 text-inherit dark:bg-amber-400/30">
                {match.match}
              </mark>
              {match.after}
            </>
          ) : preview ? (
            preview
          ) : (
            <span className="italic">No content yet</span>
          )}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {note.finalised ? <FinalisedBadge /> : null}
          {note.followUpAt ? <FollowUpBadge date={new Date(note.followUpAt)} /> : null}
          {note.loanStage ? <StageBadge stage={note.loanStage} /> : null}
          {note.noteType !== "GENERAL" ? <TypeBadge type={note.noteType} /> : null}
          {note.loanAmount ? (
            <FigureBadge>
              {formatAudCompact(note.loanAmount)}
              {note.lvr !== null ? ` · ${note.lvr}%` : ""}
            </FigureBadge>
          ) : null}
          {note.tags.slice(0, MAX_TAGS_SHOWN).map((t) => (
            <TagBadge key={t} tag={t} />
          ))}
          {note.tags.length > MAX_TAGS_SHOWN ? (
            <span className="text-muted-foreground self-center text-xs">
              +{note.tags.length - MAX_TAGS_SHOWN}
            </span>
          ) : null}
        </div>

        <p className="text-muted-foreground mt-auto pt-3 text-xs">
          <time dateTime={note.updatedAt} title={formatDateTime(updated)}>
            Edited {formatRelative(updated)}
          </time>
          {note.authorName ? <span> · by {note.authorName}</span> : null}
        </p>
      </Link>

      <div className="absolute top-2 right-2 flex items-center">
        <FavouriteButton noteId={note.id} initial={note.favourite} noteTitle={shownTitle} />
        {note.canEdit ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-10"
                aria-label={`Actions for ${shownTitle}`}
              >
                <MoreVertical className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={togglePin} disabled={pinPending}>
                {note.pinned ? (
                  <>
                    <PinOff className="size-4" aria-hidden /> Unpin
                  </>
                ) : (
                  <>
                    <Pin className="size-4" aria-hidden /> Pin to top
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmOpen(true)}>
                <Trash2 className="size-4" aria-hidden /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <DeleteNoteDialog
        noteId={note.id}
        noteTitle={shownTitle}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
      />
    </li>
  );
}

/** Highlights the first case-insensitive occurrence of `query` in a short string (titles). */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (at === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-sm bg-amber-200/70 px-0.5 text-inherit dark:bg-amber-400/30">
        {text.slice(at, at + q.length)}
      </mark>
      {text.slice(at + q.length)}
    </>
  );
}
