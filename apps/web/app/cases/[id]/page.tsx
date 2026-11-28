import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, FileText, Pencil, Plus, UserRound } from "lucide-react";

import { CaseStageBadge } from "@/components/cases/case-badges";
import { CaseFormDialog } from "@/components/cases/case-form-dialog";
import { StagePipeline } from "@/components/cases/stage-pipeline";
import { NoteCard } from "@/components/notes/note-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { activeMembers, getCase, listNotes } from "@/lib/api/queries";
import { formatDateTime, formatRelative } from "@/lib/format";
import { toNoteCardData } from "@/lib/notes/view";
import { caseTypeLabel } from "@broker-notes/shared/cases/taxonomy";
import { formatAud } from "@broker-notes/shared/money";
import { lvrOf } from "@broker-notes/shared/notes/figures";
import { parseNoteFilters } from "@broker-notes/shared/notes/filters";
import { canManageCases, canMoveCaseStage } from "@broker-notes/shared/orgs/roles";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const user = await getCurrentUser();
  const c = user ? await getCase(id) : null;
  return { title: c ? `${c.reference} · ${c.client.name}` : "Case" };
}

export default async function CasePage({ params }: Props) {
  const { id } = await params;
  const user = await requireUser();
  const canManage = canManageCases(user);
  const [c, advisers] = await Promise.all([
    getCase(id),
    canManage ? activeMembers() : Promise.resolve([]),
  ]);
  // Timeline: the case's notes (whoever wrote them), newest first, pinned on top.
  const notes = await listNotes(parseNoteFilters({ case: c.id }));
  const lvr = lvrOf({ loanAmount: c.loanAmount, propertyValue: c.propertyValue });

  const facts: [string, React.ReactNode][] = [
    ["Loan type", caseTypeLabel(c.type)],
    ["Loan amount", c.loanAmount ? formatAud(c.loanAmount) : "—"],
    ["Property value", c.propertyValue ? formatAud(c.propertyValue) : "—"],
    ["LVR", lvr !== null ? `${lvr}%${lvr > 80 ? " (LMI likely)" : ""}` : "—"],
    ["Lender", c.lender ?? "—"],
    ["Lender reference", c.lenderReference ?? "—"],
    ["Adviser", c.assignedAdviser?.name ?? "Not assigned"],
    ["Opened", `${formatDateTime(new Date(c.createdAt)).split(",")[0]} by ${c.createdBy.name}`],
  ];

  return (
    <div className="container-page pb-10">
      <Button asChild variant="ghost" size="sm" className="text-muted-foreground mt-3 -ml-2 h-10">
        <Link href="/cases">
          <ChevronLeft className="size-4" aria-hidden /> All cases
        </Link>
      </Button>

      <div className="flex flex-col gap-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-semibold tracking-tight md:text-3xl">
              {c.reference}
            </h1>
            <CaseStageBadge stage={c.stage} />
          </div>
          <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <Link
              href={`/clients/${c.client.id}`}
              className="text-foreground flex items-center gap-1.5 font-medium underline-offset-4 hover:underline"
            >
              <UserRound className="size-4" aria-hidden /> {c.client.name}
            </Link>
            <span>In this stage since {formatRelative(new Date(c.stageChangedAt))}</span>
          </p>
        </div>
        <div className="flex gap-2">
          {canManage ? (
            <CaseFormDialog
              existing={c}
              advisers={advisers}
              trigger={
                <Button variant="outline" className="h-10">
                  <Pencil className="size-4" aria-hidden /> Edit
                </Button>
              }
            />
          ) : null}
          <Button asChild className="h-10">
            <Link href={`/notes/new?case=${c.id}`}>
              <Plus className="size-4" aria-hidden /> New note
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6">
        <StagePipeline
          key={c.stage}
          caseId={c.id}
          stage={c.stage}
          canMove={canMoveCaseStage(user)}
        />

        <dl className="bg-card grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border p-4 text-sm sm:grid-cols-4">
          {facts.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="truncate font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        <section aria-labelledby="case-notes">
          <h2 id="case-notes" className="mb-3 text-lg font-semibold">
            File notes <span className="text-muted-foreground font-normal">({notes.length})</span>
          </h2>
          {notes.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No notes for this case yet"
              description="Record the conversations, lender updates and decisions for this loan."
              action={
                <Button asChild>
                  <Link href={`/notes/new?case=${c.id}`}>Write the first note</Link>
                </Button>
              }
            />
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {notes.map((n) => (
                <NoteCard key={n.id} note={toNoteCardData(n, user)} hideClient hideCase />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
