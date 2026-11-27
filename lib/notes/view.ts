import type { NoteCardData } from "@/components/notes/note-card";

import { lvrOf } from "./key-figures";
import type { NoteListItem } from "./queries";

/** Server row → serialisable props for <NoteCard> (dates as ISO strings). */
export function toNoteCardData(n: NoteListItem): NoteCardData {
  return {
    id: n.id,
    title: n.title,
    contentText: n.contentText,
    updatedAt: n.updatedAt.toISOString(),
    noteType: n.noteType,
    loanStage: n.loanStage,
    tags: n.tags,
    followUpAt: n.followUpAt?.toISOString() ?? null,
    pinned: n.pinned,
    finalised: n.status === "FINALISED",
    clientName: n.client?.name ?? null,
    loanAmount: n.keyFigures.loanAmount ?? null,
    lvr: lvrOf(n.keyFigures),
  };
}
