import type { Metadata } from "next";
import { Users } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage() {
  // Defence in depth: middleware already guards this route.
  await requireUser();

  return (
    <div className="container-page">
      <PageHeader title="Clients" description="Everyone you're helping into a home loan." />
      <EmptyState
        icon={Users}
        title="No clients yet"
        description="Client records and timelines arrive in Phase 4."
      />
    </div>
  );
}
