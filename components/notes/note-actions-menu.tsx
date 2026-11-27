"use client";

import { useState } from "react";
import { MoreHorizontal, Trash2 } from "lucide-react";

import { DeleteNoteDialog } from "@/components/notes/delete-note-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** "…" menu in the editor header. */
export function NoteActionsMenu({ noteId, noteTitle }: { noteId: string; noteTitle: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-10" aria-label="Note actions">
            <MoreHorizontal className="size-5" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmOpen(true)}>
            <Trash2 className="size-4" aria-hidden /> Delete note
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteNoteDialog
        noteId={noteId}
        noteTitle={noteTitle}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        redirectTo="/notes"
      />
    </>
  );
}
