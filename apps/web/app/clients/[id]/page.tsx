import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Briefcase,
  ChevronLeft,
  FileText,
  Mail,
  Pencil,
  Phone,
  Plus,
  UserRoundCheck,
} from "lucide-react";

import { ClientFormDialog } from "@/components/clients/client-form-dialog";
import { NoteCard } from "@/components/notes/note-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { activeMembers, getClient, listCases, listTasks } from "@/lib/api/queries";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { TaskList } from "@/components/tasks/task-list";
import { CaseCard } from "@/components/cases/case-card";
import { CaseFormDialog } from "@/components/cases/case-form-dialog";
import { canManageCases, canManageClients } from "@broker-notes/shared/orgs/roles";
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
  const user = await requireUser();
  const canManage = canManageClients(user);
  const [client, advisers] = await Promise.all([
    getClient(id),
    canManage ? activeMembers() : Promise.resolve([]),
  ]);
  if (!client) notFound();

  // Timeline: this client's notes (everyone in the brokerage), newest first, pinned on top.
  const [notes, cases, tasks, members] = await Promise.all([
    listNotes(parseNoteFilters({ client: client.id })),
    listCases({ client: client.id, status: "all" }),
    listTasks({ client: client.id }),
    activeMembers(),
  ]);
  const canOpenCase = canManageCases(user);

  return (
    <div className="container-page">
      <Button asChild variant="ghost" size="sm" className="text-muted-foreground mt-3 -ml-2 h-10">
        <Link href="/clients">
          <ChevronLeft className="size-4" aria-hidden /> All clients
        </Link>
      </Button>

      <div className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between md:py-6">
        <div className="flex min-w-0 items-center gap-4">
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
              {client.assignedAdviser ? (
                <span className="flex items-center gap-1.5">
                  <UserRoundCheck className="size-3.5" aria-hidden /> Adviser:{" "}
                  {client.assignedAdviser.name}
                </span>
              ) : null}
              <span>Client since {formatDateTime(new Date(client.createdAt)).split(",")[0]}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {canManage ? (
            <ClientFormDialog
              advisers={advisers}
              client={{
                id: client.id,
                name: client.name,
                email: client.email,
                phone: client.phone,
                assignedAdviser: client.assignedAdviser,
              }}
              trigger={
                <Button variant="outline" className="h-10">
                  <Pencil className="size-4" aria-hidden /> Edit
                </Button>
              }
            />
          ) : null}
          <Button asChild className="h-10">
            <Link href={`/notes/new?client=${client.id}`}>
              <Plus className="size-4" aria-hidden /> New note
            </Link>
          </Button>
        </div>
      </div>

      <section aria-labelledby="client-cases" className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="client-cases" className="text-lg font-semibold">
            Cases <span className="text-muted-foreground font-normal">({cases.length})</span>
          </h2>
          {canOpenCase ? (
            <CaseFormDialog
              clients={[{ id: client.id, name: client.name }]}
              defaultClientId={client.id}
              advisers={advisers}
              trigger={
                <Button variant="outline" className="h-10">
                  <Briefcase className="size-4" aria-hidden /> New case
                </Button>
              }
            />
          ) : null}
        </div>
        {cases.length === 0 ? (
          <p className="text-muted-foreground bg-card rounded-xl border p-4 text-sm">
            No cases yet. A case tracks one loan from enquiry to settlement.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cases.map((c) => (
              <CaseCard key={c.id} item={c} hideClient />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="client-tasks" className="mb-8 grid min-w-0 grid-cols-1 gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="client-tasks" className="text-lg font-semibold">
            Open tasks <span className="text-muted-foreground font-normal">({tasks.length})</span>
          </h2>
          <TaskFormDialog
            members={members}
            defaultAssigneeId={user.id}
            links={{ clientId: client.id, label: client.name }}
            trigger={
              <Button variant="outline" className="h-10">
                <Plus className="size-4" aria-hidden /> Add task
              </Button>
            }
          />
        </div>
        <TaskList
          tasks={tasks}
          members={members}
          hide={{ client: true }}
          empty="No open tasks for this client."
        />
      </section>

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
              <Link href={`/notes/new?client=${client.id}`}>Write the first note</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((n) => (
            <NoteCard key={n.id} note={toNoteCardData(n, user)} hideClient />
          ))}
        </ul>
      )}
    </div>
  );
}
