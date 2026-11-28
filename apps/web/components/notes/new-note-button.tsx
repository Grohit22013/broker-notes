"use client";

import { useFormStatus } from "react-dom";
import { Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useCreateNoteAction } from "@/hooks/use-create-note";

function Submit({ label, size }: { label: string; size: "default" | "lg" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size={size} className="h-11" disabled={pending}>
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Plus className="size-4" aria-hidden />
      )}
      {pending ? "Creating…" : label}
    </Button>
  );
}

/** Creates a blank note via the API, then opens it in the editor. */
export function NewNoteButton({
  label = "New note",
  size = "default",
}: {
  label?: string;
  size?: "default" | "lg";
}) {
  const createNote = useCreateNoteAction();
  return (
    <form action={createNote}>
      <Submit label={label} size={size} />
    </form>
  );
}
