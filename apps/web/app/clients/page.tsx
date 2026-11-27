import type { Metadata } from "next";
import Link from "next/link";
import { Download, Mail, Phone, Plus, Search, Users } from "lucide-react";

import { ClientFormDialog } from "@/components/clients/client-form-dialog";
import { ImportClientsDialog } from "@/components/clients/import-clients-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/lib/auth/session";
import { existingClientEmails, listClients } from "@/lib/api/queries";
import { formatRelative, initials } from "@/lib/format";

export const metadata: Metadata = { title: "Clients" };

type Props = { searchParams: Promise<{ q?: string | string[] }> };

export default async function ClientsPage({ searchParams }: Props) {
  // Defence in depth: middleware already guards this route.
  await requireUser();
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 100) ?? "";
  const [clients, emails] = await Promise.all([listClients(q), existingClientEmails()]);
  const hasAny = clients.length > 0 || q.length > 0;

  const addButton = (
    <ClientFormDialog
      trigger={
        <Button className="h-10">
          <Plus className="size-4" aria-hidden /> New client
        </Button>
      }
    />
  );

  return (
    <div className="container-page">
      <PageHeader
        title="Clients"
        description="Everyone you're helping into a home loan, with their file notes."
        actions={
          <>
            <ImportClientsDialog existingEmails={[...emails]} />
            {hasAny ? (
              <Button asChild variant="outline" className="h-10">
                <a href="/api/export/clients" download aria-label="Export CSV">
                  <Download className="size-4" aria-hidden />
                  <span className="hidden sm:inline">Export CSV</span>
                </a>
              </Button>
            ) : null}
            {addButton}
          </>
        }
      />

      {!hasAny ? (
        <EmptyState
          icon={Users}
          title="No clients yet"
          description="Add clients one by one, or import them from a CSV exported from your CRM."
          action={addButton}
        />
      ) : (
        <>
          <form role="search" className="relative mb-4 max-w-md" action="/clients">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              type="search"
              name="q"
              defaultValue={q}
              aria-label="Search clients"
              placeholder="Search by name, email or phone…"
              className="h-11 pl-9 text-base md:h-10 md:text-sm"
            />
          </form>

          {clients.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              No clients match “{q}”.{" "}
              <Link href="/clients" className="text-primary underline">
                Clear search
              </Link>
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {clients.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/clients/${c.id}`}
                    className="bg-card hover:border-primary/40 focus-visible:ring-ring/50 flex h-full gap-3 rounded-xl border p-4 outline-none focus-visible:ring-2 md:p-5"
                    aria-label={`Open client: ${c.name}`}
                  >
                    <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold">
                      {initials(c.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.name}</span>
                      {c.email ? (
                        <span className="text-muted-foreground flex items-center gap-1.5 truncate text-sm">
                          <Mail className="size-3.5 shrink-0" aria-hidden /> {c.email}
                        </span>
                      ) : null}
                      {c.phone ? (
                        <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
                          <Phone className="size-3.5 shrink-0" aria-hidden /> {c.phone}
                        </span>
                      ) : null}
                      <span className="text-muted-foreground mt-2 block text-xs">
                        {c.noteCount} {c.noteCount === 1 ? "note" : "notes"}
                        {c.lastNoteAt ? ` · last ${formatRelative(new Date(c.lastNoteAt))}` : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
