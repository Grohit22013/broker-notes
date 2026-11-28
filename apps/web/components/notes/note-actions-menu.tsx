"use client";

import { useState } from "react";
import { LayoutTemplate, MoreHorizontal, Trash2 } from "lucide-react";

import { DeleteNoteDialog } from "@/components/notes/delete-note-dialog";
import { SaveTemplateDialog } from "@/components/notes/save-template-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** "…" menu in the editor header. */
export function NoteActionsMenu({
  noteId,
  noteTitle,
  canDelete,
  canSaveTemplate,
  beforeSaveTemplate,
}: {
  noteId: string;
  noteTitle: string;
  canDelete: boolean;
  canSaveTemplate: boolean;
  beforeSaveTemplate?: () => Promise<void> | void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  if (!canDelete && !canSaveTemplate) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-10" aria-label="Note actions">
            <MoreHorizontal className="size-5" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canSaveTemplate ? (
            <DropdownMenuItem onSelect={() => setTemplateOpen(true)}>
              <LayoutTemplate className="size-4" aria-hidden /> Save as template…
            </DropdownMenuItem>
          ) : null}
          {canSaveTemplate && canDelete ? <DropdownMenuSeparator /> : null}
          {canDelete ? (
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmOpen(true)}>
              <Trash2 className="size-4" aria-hidden /> Delete note
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {canDelete ? (
        <DeleteNoteDialog
          noteId={noteId}
          noteTitle={noteTitle}
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          redirectTo="/notes"
        />
      ) : null}
      {canSaveTemplate ? (
        <SaveTemplateDialog
          noteId={noteId}
          open={templateOpen}
          onOpenChange={setTemplateOpen}
          beforeSave={beforeSaveTemplate}
        />
      ) : null}
    </>
  );
}
