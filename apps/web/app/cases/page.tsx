import type { Metadata } from "next";
import { Briefcase, Plus, Search, SearchX } from "lucide-react";

import { CaseCard } from "@/components/cases/case-card";
import { CaseFormDialog } from "@/components/cases/case-form-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterChip } from "@/components/shared/filter-chip";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/lib/auth/session";
import { activeMembers, clientOptions, listCases } from "@/lib/api/queries";
import { CASE_STAGES } from "@broker-notes/shared/cases/taxonomy";
import { caseFiltersSchema } from "@broker-notes/shared/cases/validation";
import { canManageCases } from "@broker-notes/shared/orgs/roles";

export const metadata: Metadata = { title: "Cases" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CasesPage({ searchParams }: Props) {
  const user = await requireUser();
  const f = caseFiltersSchema.parse(await searchParams);
  const canManage = canManageCases(user);
  const [cases, clients, advisers] = await Promise.all([
    listCases({
      q: f.q,
      stage: f.stage,
      client: f.client,
      status: f.status,
      mine: f.mine ? "1" : undefined,
    }),
    canManage ? clientOptions() : Promise.resolve([]),
    canManage ? activeMembers() : Promise.resolve([]),
  ]);

  /** URL for this page with some filters changed (search and other filters kept). */
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const next = {
      q: f.q || undefined,
      stage: f.stage,
      status: f.status === "open" ? undefined : f.status,
      mine: f.mine ? "1" : undefined,
      ...patch,
    };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/cases?${qs}` : "/cases";
  };

  const chip = (label: string, to: string, active: boolean) => (
    <FilterChip key={label} href={to} active={active}>
      {label}
    </FilterChip>
  );

  const newCase = canManage ? (
    <CaseFormDialog
      clients={clients}
      advisers={advisers}
      trigger={
        <Button className="h-10">
          <Plus className="size-4" aria-hidden /> New case
        </Button>
      }
    />
  ) : null;

  const filtering = Boolean(f.q || f.stage || f.mine || f.status !== "open");

  return (
    <div className="container-page">
      <PageHeader
        title="Cases"
        description="Each case tracks one loan for a client through the pipeline, with its file notes."
        actions={newCase}
      />

      <form action="/cases" className="relative mb-3 max-w-md" role="search">
        {f.status !== "open" ? <input type="hidden" name="status" value={f.status} /> : null}
        {f.mine ? <input type="hidden" name="mine" value="1" /> : null}
        <Search
          className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          type="search"
          name="q"
          defaultValue={f.q}
          placeholder="Search reference, client or lender"
          aria-label="Search cases"
          className="h-11 pl-9 text-base md:text-sm"
        />
      </form>

      <nav aria-label="Filter cases" className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {chip(
          "Open",
          href({ status: undefined, stage: undefined }),
          f.status === "open" && !f.stage,
        )}
        {chip(
          "Settled & closed",
          href({ status: "done", stage: undefined }),
          f.status === "done" && !f.stage,
        )}
        {chip("All", href({ status: "all", stage: undefined }), f.status === "all" && !f.stage)}
        {chip("Assigned to me", href({ mine: f.mine ? undefined : "1" }), f.mine)}
        <span className="bg-border mx-1 w-px shrink-0" aria-hidden />
        {CASE_STAGES.map((s) =>
          chip(
            s.label,
            href({ stage: f.stage === s.value ? undefined : s.value }),
            f.stage === s.value,
          ),
        )}
      </nav>

      {cases.length === 0 ? (
        filtering ? (
          <EmptyState
            icon={SearchX}
            title="No cases match"
            description="Try another search or filter."
            action={
              <Button asChild variant="outline">
                {/* Plain link on purpose: same-page navigations can stall (see FilterChip). */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a href="/cases">Clear filters</a>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Briefcase}
            title="No open cases"
            description={
              canManage
                ? "Open a case for a client to track their loan from enquiry to settlement."
                : "Advisers open cases; you'll see them here to track and update their stage."
            }
            action={newCase ?? undefined}
          />
        )
      ) : (
        <>
          <p className="text-muted-foreground mb-3 text-sm" aria-live="polite">
            {cases.length} {cases.length === 1 ? "case" : "cases"}
          </p>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cases.map((c) => (
              <CaseCard key={c.id} item={c} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
