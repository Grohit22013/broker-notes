import type { NoteListItemDto } from "@broker-notes/shared/dto";
import { lvrOf } from "@broker-notes/shared/notes/figures";
import { canEditNote, type Actor } from "@broker-notes/shared/orgs/roles";

import type { NoteCardData } from "@/components/notes/note-card";

/** API list item → props for <NoteCard>, from the viewer's point of view. */
export function toNoteCardData(n: NoteListItemDto, viewer: Actor): NoteCardData {
  return {
    id: n.id,
    title: n.title,
    contentText: n.contentText,
    updatedAt: n.updatedAt,
    noteType: n.noteType,
    loanStage: n.loanStage,
    tags: n.tags,
    followUpAt: n.followUpAt,
    pinned: n.pinned,
    finalised: n.status === "FINALISED",
    clientName: n.client?.name ?? null,
    caseReference: n.case?.reference ?? null,
    loanAmount: n.keyFigures.loanAmount ?? null,
    lvr: lvrOf(n.keyFigures),
    authorName: n.author.id === viewer.id ? null : n.author.name,
    canEdit: canEditNote(viewer, n.author.id),
  };
}
