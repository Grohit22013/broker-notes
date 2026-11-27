"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreVertical, Trash2 } from "lucide-react";

import { DeleteNoteDialog } from "@/components/notes/delete-note-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDateTime, formatRelative } from "@/lib/format";
import { displayTitle, snippet } from "@/lib/notes/content";

type NoteCardProps = {
  id: string;
  title: string;
  contentText: string;
  updatedAt: string; // ISO — serialisable across the server/client boundary
};

export function NoteCard({ id, title, contentText, updatedAt }: NoteCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const shownTitle = displayTitle(title);
  const preview = snippet(contentText);
  const updated = new Date(updatedAt);

  return (
    <li className="group bg-card hover:border-primary/40 focus-within:ring-ring/50 relative rounded-xl border transition-colors focus-within:ring-2">
      {/* The whole card is a link; the menu button sits above it. */}
      <Link
        href={`/notes/${id}`}
        className="block rounded-xl p-4 pr-12 outline-none md:p-5 md:pr-12"
        aria-label={`Open note: ${shownTitle}`}
      >
        <h2 className="line-clamp-1 font-medium">{shownTitle}</h2>
        <p className="text-muted-foreground mt-1 line-clamp-2 min-h-10 text-sm">
          {preview || <span className="italic">No content yet</span>}
        </p>
        <p className="text-muted-foreground mt-3 text-xs">
          <time dateTime={updatedAt} title={formatDateTime(updated)}>
            Edited {formatRelative(updated)}
          </time>
        </p>
      </Link>

      <div className="absolute top-2 right-2">
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
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmOpen(true)}>
              <Trash2 className="size-4" aria-hidden /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <DeleteNoteDialog
        noteId={id}
        noteTitle={shownTitle}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
      />
    </li>
  );
}
