import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FileText, Mail, Pencil, Phone, Plus } from "lucide-react";

import { ClientFormDialog } from "@/components/clients/client-form-dialog";
import { NoteCard } from "@/components/notes/note-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { getClient } from "@/lib/api/queries";
import { formatDateTime, initials } from "@/lib/format";
import { parseNoteFilters } from "@broker-notes/shared/notes/filters";
import { listNotes } from "@/lib/api/queries";
import { toNoteCardData } from "@/lib/notes/view";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const user = await getCurrentUser();
  const client = user ? await getClient(id) : null;
  return { title: client?.name ?? "Client" };
}

export default async function ClientPage({ params }: Props) {
  const { id } = await params;
  await requireUser();
  const client = await getClient(id);
  if (!client) notFound();

  // Timeline: this client's notes, newest first (pinned still on top).
  const notes = await listNotes(parseNoteFilters({ client: client.id }));

  return (
    <div className="container-page">
      <Button asChild variant="ghost" size="sm" className="text-muted-foreground mt-3 -ml-2 h-10">
        <Link href="/clients">
          <ChevronLeft className="size-4" aria-hidden /> All clients
        </Link>
      </Button>

      <div className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between md:py-6">
        <div className="flex items-center gap-4">
          <span className="bg-primary/10 text-primary grid size-14 shrink-0 place-items-center rounded-full text-lg font-semibold">
            {initials(client.name)}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight md:text-3xl">
              {client.name}
            </h1>
            <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {client.email ? (
                <a
                  href={`mailto:${client.email}`}
                  className="hover:text-foreground flex items-center gap-1.5"
                >
                  <Mail className="size-3.5" aria-hidden /> {client.email}
                </a>
              ) : null}
              {client.phone ? (
                <a
                  href={`tel:${client.phone.replace(/\s/g, "")}`}
                  className="hover:text-foreground flex items-center gap-1.5"
                >
                  <Phone className="size-3.5" aria-hidden /> {client.phone}
                </a>
              ) : null}
              <span>Client since {formatDateTime(new Date(client.createdAt)).split(",")[0]}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <ClientFormDialog
            client={{ id: client.id, name: client.name, email: client.email, phone: client.phone }}
            trigger={
              <Button variant="outline" className="h-10">
                <Pencil className="size-4" aria-hidden /> Edit
              </Button>
            }
          />
          <Button asChild className="h-10">
            <Link href={`/notes/new?client=${client.id}`}>
              <Plus className="size-4" aria-hidden /> New note
            </Link>
          </Button>
        </div>
      </div>

      <h2 className="mb-3 text-lg font-semibold">
        File notes <span className="text-muted-foreground font-normal">({notes.length})</span>
      </h2>
      {notes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No notes for this client yet"
          description="Start with a discovery call or fact find template."
          action={
            <Button asChild>
              <Link href={`/notes/new?client=${client.id}`}>New note for {client.name}</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((n) => (
            <NoteCard key={n.id} note={toNoteCardData(n)} hideClient />
          ))}
        </ul>
      )}
    </div>
  );
}
