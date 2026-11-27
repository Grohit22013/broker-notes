import type { Metadata } from "next";
import { FileText } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Notes" };

export default async function NotesPage() {
  // Defence in depth: middleware already guards this route.
  await requireUser();

  return (
    <div className="container-page">
      <PageHeader title="Notes" description="Your client file notes, newest first." />
      <EmptyState
        icon={FileText}
        title="No notes yet"
        description="Creating and editing notes with the Tiptap editor arrives in Phase 2."
      />
    </div>
  );
}
