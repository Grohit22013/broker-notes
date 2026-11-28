import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { NoteDetailsProvider } from "@/components/notes/note-details";
import { NoteWorkspace } from "@/components/notes/note-workspace";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { clientOptions } from "@/lib/api/queries";
import { toIsoDate } from "@broker-notes/shared/dates";
import { displayTitle } from "@broker-notes/shared/notes/content";
import { activeMembers, getNote, getNoteFacets, listTasks } from "@/lib/api/queries";
import { canEditNote, canManageClients } from "@broker-notes/shared/orgs/roles";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const user = await getCurrentUser();
  const note = user ? await getNote(id) : null;
  return { title: note ? displayTitle(note.title) : "Note" };
}

export default async function NotePage({ params }: Props) {
  const { id } = await params;
  const user = await requireUser();
  // Scoped by brokerage: another brokerage's note id resolves to a 404, never its content.
  const [note, facets, clients, tasks, members] = await Promise.all([
    getNote(id),
    getNoteFacets(),
    clientOptions(),
    listTasks({ note: id, status: "all" }),
    activeMembers(),
  ]);
  if (!note) notFound();
  const canEdit = canEditNote(user, note.author.id);

  return (
    <NoteDetailsProvider
      noteId={note.id}
      tagSuggestions={facets.tags}
      clients={clients}
      readOnly={!canEdit}
      canAddClients={canManageClients(user)}
      initial={{
        noteType: note.noteType,
        loanStage: note.loanStage,
        tags: note.tags,
        followUpDate: note.followUpAt ? toIsoDate(new Date(note.followUpAt)) : null,
        pinned: note.pinned,
        clientId: note.client?.id ?? null,
        clientName: note.client?.name ?? null,
        caseId: note.case?.id ?? null,
        caseReference: note.case?.reference ?? null,
        keyFigures: note.keyFigures,
        status: note.status,
      }}
    >
      <NoteWorkspace
        noteId={note.id}
        title={note.title}
        displayTitle={displayTitle(note.title)}
        contentJson={note.contentJson}
        revision={note.revision}
        favourite={note.favourite}
        canSaveTemplate={canManageClients(user)}
        createdAt={note.createdAt}
        author={note.author.id === user.id ? null : note.author.name}
        canEdit={canEdit}
        tasks={tasks}
        members={members}
        currentUserId={user.id}
        finalisedAt={note.finalisedAt}
        amendments={note.amendments.map((a) => ({
          id: a.id,
          body: a.body,
          createdAt: a.createdAt,
        }))}
      />
    </NoteDetailsProvider>
  );
}
