import type { Metadata } from "next";
import { FileText } from "lucide-react";

import { NewNoteButton } from "@/components/notes/new-note-button";
import { NoteCard } from "@/components/notes/note-card";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth/session";
import { listNotes } from "@/lib/notes/queries";

export const metadata: Metadata = { title: "Notes" };

export default async function NotesPage() {
  // Defence in depth: middleware already guards this route.
  const user = await requireUser();
  const notes = await listNotes(user.id);

  return (
    <div className="container-page">
      <PageHeader
        title="Notes"
        description={
          notes.length > 0
            ? `${notes.length} ${notes.length === 1 ? "note" : "notes"}, most recently edited first.`
            : "Your client file notes will appear here."
        }
        actions={notes.length > 0 ? <NewNoteButton /> : null}
      />

      {notes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No notes yet"
          description="Capture your first client conversation — discovery calls, fact finds, lender rationale and more."
          action={<NewNoteButton label="Create your first note" size="lg" />}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((n) => (
            <NoteCard
              key={n.id}
              id={n.id}
              title={n.title}
              contentText={n.contentText}
              updatedAt={n.updatedAt.toISOString()}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
