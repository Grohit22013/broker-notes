import type { Metadata } from "next";
import { FilePlus2 } from "lucide-react";

import { NewNoteButton } from "@/components/notes/new-note-button";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "New note" };

export default async function NewNotePage() {
  await requireUser();

  return (
    <div className="container-page">
      <PageHeader title="New note" description="Start a file note for a client conversation." />
      <div className="bg-card max-w-md rounded-xl border p-6">
        <span className="bg-accent text-primary mb-4 grid size-12 place-items-center rounded-full">
          <FilePlus2 className="size-6" aria-hidden />
        </span>
        <h2 className="font-medium">Blank note</h2>
        <p className="text-muted-foreground mt-1 mb-5 text-sm">
          A clean page with headings, checklists, tables and highlights.
        </p>
        <NewNoteButton label="Create blank note" />
      </div>
    </div>
  );
}
