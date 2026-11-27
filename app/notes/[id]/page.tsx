import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { NoteEditor } from "@/components/editor/note-editor";
import { NoteActionsMenu } from "@/components/notes/note-actions-menu";
import {
  NoteDetailsButton,
  NoteDetailsProvider,
  NoteDetailsSheet,
  NoteDetailsSummary,
} from "@/components/notes/note-details";
import { Button } from "@/components/ui/button";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { toIsoDate } from "@/lib/dates";
import { formatDateTime } from "@/lib/format";
import { displayTitle } from "@/lib/notes/content";
import { getNote, getNoteFacets } from "@/lib/notes/queries";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const user = await getCurrentUser();
  const note = user ? await getNote(user.id, id) : null;
  return { title: note ? displayTitle(note.title) : "Note" };
}

export default async function NotePage({ params }: Props) {
  const { id } = await params;
  const user = await requireUser();
  // Scoped by user id: someone else's note id resolves to a 404, never their content.
  const [note, facets] = await Promise.all([getNote(user.id, id), getNoteFacets(user.id)]);
  if (!note) notFound();

  return (
    <NoteDetailsProvider
      noteId={note.id}
      tagSuggestions={facets.tags}
      initial={{
        noteType: note.noteType,
        loanStage: note.loanStage,
        tags: note.tags,
        followUpDate: note.followUpAt ? toIsoDate(note.followUpAt) : null,
        pinned: note.pinned,
      }}
    >
      <div className="container-page">
        <div className="flex items-center justify-between gap-2 pt-3">
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground -ml-2 h-10">
            <Link href="/notes">
              <ChevronLeft className="size-4" aria-hidden /> All notes
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground hidden text-xs lg:inline">
              Created {formatDateTime(note.createdAt)}
            </span>
            <NoteDetailsButton />
            <NoteActionsMenu noteId={note.id} noteTitle={displayTitle(note.title)} />
          </div>
        </div>

        <NoteEditor
          noteId={note.id}
          initialTitle={note.title}
          initialContent={note.contentJson}
          belowTitle={<NoteDetailsSummary />}
        />
      </div>
      <NoteDetailsSheet />
    </NoteDetailsProvider>
  );
}
