import type { NoteListItemDto } from "@broker-notes/shared/dto";
import { lvrOf } from "@broker-notes/shared/notes/figures";

import type { NoteCardData } from "@/components/notes/note-card";

/** API list item → props for <NoteCard>. */
export function toNoteCardData(n: NoteListItemDto): NoteCardData {
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
    loanAmount: n.keyFigures.loanAmount ?? null,
    lvr: lvrOf(n.keyFigures),
  };
}
