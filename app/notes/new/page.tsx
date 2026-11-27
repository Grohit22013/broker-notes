import type { Metadata } from "next";

import { TemplatePicker } from "@/components/notes/template-picker";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth/session";
import { clientOptions } from "@/lib/clients/queries";
import { BLANK_TEMPLATE_ID, TEMPLATES } from "@/lib/notes/templates";

export const metadata: Metadata = { title: "New note" };

type Props = { searchParams: Promise<{ client?: string }> };

export default async function NewNotePage({ searchParams }: Props) {
  const user = await requireUser();
  const [{ client }, clients] = await Promise.all([searchParams, clientOptions(user.id)]);
  const defaultClientId = clients.some((c) => c.id === client) ? client : undefined;

  return (
    <div className="container-page">
      <PageHeader
        title="New note"
        description="Pick a template — headings follow what a compliant file note needs to show."
      />
      <TemplatePicker
        clients={clients}
        defaultClientId={defaultClientId}
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
