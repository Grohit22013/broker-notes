import type { Metadata } from "next";

import { TemplatePicker } from "@/components/notes/template-picker";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth/session";
import { caseOptions, clientOptions } from "@/lib/api/queries";
import { BLANK_TEMPLATE_ID, TEMPLATES } from "@broker-notes/shared/notes/templates";

export const metadata: Metadata = { title: "New note" };

type Props = { searchParams: Promise<{ client?: string; case?: string }> };

export default async function NewNotePage({ searchParams }: Props) {
  await requireUser();
  const [{ client, case: caseId }, clients, cases] = await Promise.all([
    searchParams,
    clientOptions(),
    caseOptions(),
  ]);
  const forCase = cases.find((c) => c.id === caseId);
  const defaultClientId =
    forCase?.clientId ?? (clients.some((c) => c.id === client) ? client : undefined);

  return (
    <div className="container-page">
      <PageHeader
        title="New note"
        description="Pick a template — headings follow what a compliant file note needs to show."
      />
      <TemplatePicker
        clients={clients}
        defaultClientId={defaultClientId}
        forCase={forCase ? { id: forCase.id, reference: forCase.reference } : undefined}
        templates={[
          {
            id: BLANK_TEMPLATE_ID,
            name: "Blank note",
            description: "A clean page with headings, checklists, tables and highlights.",
          },
          ...TEMPLATES.map(({ id, name, description }) => ({ id, name, description })),
        ]}
      />
    </div>
  );
}
