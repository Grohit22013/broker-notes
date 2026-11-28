import type { Metadata } from "next";
import Link from "next/link";
import { Download, FileText, SearchX, UserRound, X } from "lucide-react";

import { NewNoteButton } from "@/components/notes/new-note-button";
import { NoteCard } from "@/components/notes/note-card";
import { NotesFilters } from "@/components/notes/notes-filters";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { getClient } from "@/lib/api/queries";
import {
  filtersToSearchParams,
  hasAnyFilter,
  parseNoteFilters,
} from "@broker-notes/shared/notes/filters";
import { getNoteFacets, listNotes } from "@/lib/api/queries";
import { toNoteCardData } from "@/lib/notes/view";

export const metadata: Metadata = { title: "Notes" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function NotesPage({ searchParams }: Props) {
  // Defence in depth: middleware already guards this route.
  await requireUser();
  const filters = parseNoteFilters(await searchParams);
  const [notes, facets, client] = await Promise.all([
    listNotes(filters),
    getNoteFacets(),
    filters.client ? getClient(filters.client) : null,
  ]);
  const filtering = hasAnyFilter(filters);
  const exportQuery = filtersToSearchParams(filters).toString();
  const withoutClient = filtersToSearchParams({ ...filters, client: undefined }).toString();

  if (facets.total === 0) {
    return (
      <div className="container-page">
        <PageHeader title="Notes" description="Your client file notes will appear here." />
        <EmptyState
          icon={FileText}
          title="No notes yet"
          description="Capture your first client conversation — discovery calls, fact finds, lender rationale and more."
          action={
            <Button asChild size="lg" className="h-11">
              <Link href="/notes/new">Create your first note</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="container-page">
      <PageHeader
        title="Notes"
        description={`${facets.total} ${facets.total === 1 ? "note" : "notes"} · pinned first`}
        actions={
          <>
            <Button asChild variant="outline" className="h-10">
              <a href={`/api/export/notes${exportQuery ? `?${exportQuery}` : ""}`} download>
                <Download className="size-4" aria-hidden />
                {filtering ? "Export filtered (CSV)" : "Export CSV"}
              </a>
            </Button>
            {/* On phones the bottom nav already has “New”. */}
            <div className="hidden md:block">
              <NewNoteButton />
            </div>
          </>
        }
      />

      {client ? (
        <div className="mb-3">
          <Link
            href={withoutClient ? `/notes?${withoutClient}` : "/notes"}
            className="bg-primary/10 text-primary hover:bg-primary/15 inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium"
            aria-label={`Remove client filter: ${client.name}`}
          >
            <UserRound className="size-4" aria-hidden />
            {client.name}
            <X className="size-4" aria-hidden />
          </Link>
        </div>
      ) : null}

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
            <NoteCard key={n.id} query={filters.q} note={toNoteCardData(n)} />
          ))}
        </ul>
      )}
    </div>
  );
}
