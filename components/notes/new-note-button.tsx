"use client";

import { useFormStatus } from "react-dom";
import { Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createNoteAction } from "@/server/note-actions";

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

/** Creates a blank note via a server action (POST), then redirects to the editor. */
export function NewNoteButton({
  label = "New note",
  size = "default",
}: {
  label?: string;
  size?: "default" | "lg";
}) {
  return (
    <form action={createNoteAction}>
      <Submit label={label} size={size} />
    </form>
  );
}
