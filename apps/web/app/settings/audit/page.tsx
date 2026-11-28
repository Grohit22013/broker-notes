import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { AuditList } from "@/components/team/audit-list";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterChip } from "@/components/shared/filter-chip";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { getAuditPage } from "@/lib/api/queries";
import { AUDIT_CATEGORIES, AUDIT_CATEGORY_VALUES } from "@broker-notes/shared/orgs/audit";
import { canManageTeam } from "@broker-notes/shared/orgs/roles";

export const metadata: Metadata = { title: "Audit log" };

type Props = { searchParams: Promise<{ category?: string | string[] }> };

export default async function AuditPage({ searchParams }: Props) {
  const user = await requireUser();
  if (!canManageTeam(user)) {
    return (
      <div className="container-page">
        <PageHeader title="Audit log" />
        <EmptyState
          icon={ShieldAlert}
          title="Admins only"
          description="The audit log is available to your brokerage's admins."
          action={
            <Button asChild variant="outline">
              <Link href="/notes">Back to notes</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const raw = (await searchParams).category;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const category = AUDIT_CATEGORY_VALUES.find((c) => c === value);
  const page = await getAuditPage(category);

  const chip = (href: string, label: string, active: boolean) => (
    <FilterChip key={label} href={href} active={active}>
      {label}
    </FilterChip>
  );

  return (
    <div className="container-page max-w-4xl">
      <PageHeader
        title="Audit log"
        description={`Who did what in ${user.organisationName || "your brokerage"}, newest first. Entries can't be edited or deleted.`}
      />
      <nav aria-label="Filter by category" className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {chip("/settings/audit", "All", !category)}
        {AUDIT_CATEGORIES.map((c) =>
          chip(`/settings/audit?category=${c.value}`, c.label, category === c.value),
        )}
      </nav>
      <AuditList key={category ?? "all"} initial={page} category={category} />
    </div>
  );
}
