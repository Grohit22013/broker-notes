import type { Metadata } from "next";
import Link from "next/link";
import { FileText, SearchX } from "lucide-react";

import { NewNoteButton } from "@/components/notes/new-note-button";
import { NoteCard } from "@/components/notes/note-card";
import { NotesFilters } from "@/components/notes/notes-filters";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { hasAnyFilter, parseNoteFilters } from "@/lib/notes/filters";
import { getNoteFacets, listNotes } from "@/lib/notes/queries";

export const metadata: Metadata = { title: "Notes" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function NotesPage({ searchParams }: Props) {
  // Defence in depth: middleware already guards this route.
  const user = await requireUser();
  const filters = parseNoteFilters(await searchParams);
  const now = new Date();
  const [notes, facets] = await Promise.all([
    listNotes(user.id, filters, now),
    getNoteFacets(user.id, now),
  ]);
  const filtering = hasAnyFilter(filters);

  if (facets.total === 0) {
    return (
      <div className="container-page">
        <PageHeader title="Notes" description="Your client file notes will appear here." />
        <EmptyState
          icon={FileText}
          title="No notes yet"
          description="Capture your first client conversation — discovery calls, fact finds, lender rationale and more."
          action={<NewNoteButton label="Create your first note" size="lg" />}
        />
      </div>
    );
  }

  return (
    <div className="container-page">
      <PageHeader
        title="Notes"
        description={`${facets.total} ${facets.total === 1 ? "note" : "notes"} · pinned first`}
        // On phones the bottom nav already has “New”, so keep the list higher up the screen.
        actions={
          <div className="hidden md:block">
            <NewNoteButton />
          </div>
        }
      />

      <NotesFilters filters={filters} tags={facets.tags} dueCount={facets.dueCount} />

      <p className="text-muted-foreground mt-4 mb-3 text-sm" aria-live="polite">
        {filtering
          ? `${notes.length} ${notes.length === 1 ? "result" : "results"}${filters.q ? ` for “${filters.q}”` : ""}`
          : `Showing all ${notes.length} notes`}
      </p>

      {notes.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No notes match"
          description="Try a different search, or clear the filters to see all your notes."
          action={
            <Button asChild variant="outline">
              <Link href="/notes">Clear filters</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((n) => (
            <NoteCard
              key={n.id}
              query={filters.q}
              note={{
                id: n.id,
                title: n.title,
                contentText: n.contentText,
                updatedAt: n.updatedAt.toISOString(),
                noteType: n.noteType,
                loanStage: n.loanStage,
                tags: n.tags,
                followUpAt: n.followUpAt?.toISOString() ?? null,
                pinned: n.pinned,
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
