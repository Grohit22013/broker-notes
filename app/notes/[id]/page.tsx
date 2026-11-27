import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { NoteDetailsProvider } from "@/components/notes/note-details";
import { NoteWorkspace } from "@/components/notes/note-workspace";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { clientOptions } from "@/lib/clients/queries";
import { toIsoDate } from "@/lib/dates";
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
  const [note, facets, clients] = await Promise.all([
    getNote(user.id, id),
    getNoteFacets(user.id),
    clientOptions(user.id),
  ]);
  if (!note) notFound();

  return (
    <NoteDetailsProvider
      noteId={note.id}
      tagSuggestions={facets.tags}
      clients={clients}
      initial={{
        noteType: note.noteType,
        loanStage: note.loanStage,
        tags: note.tags,
        followUpDate: note.followUpAt ? toIsoDate(note.followUpAt) : null,
        pinned: note.pinned,
        clientId: note.client?.id ?? null,
        clientName: note.client?.name ?? null,
        keyFigures: note.keyFigures,
        status: note.status,
      }}
    >
      <NoteWorkspace
        noteId={note.id}
        title={note.title}
        displayTitle={displayTitle(note.title)}
        contentJson={note.contentJson}
        createdAt={note.createdAt.toISOString()}
        finalisedAt={note.finalisedAt?.toISOString() ?? null}
        amendments={note.amendments.map((a) => ({
          id: a.id,
          body: a.body,
          createdAt: a.createdAt.toISOString(),
        }))}
      />
    </NoteDetailsProvider>
  );
}
