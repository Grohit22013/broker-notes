"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createNoteFromForm } from "@/lib/api/actions";

/** A form `action` that creates a note via the API, then opens it in the editor. */
export function useCreateNoteAction() {
  const router = useRouter();
  return useCallback(
    async (formData: FormData) => {
      const res = await createNoteFromForm(formData);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.push(`/notes/${res.id}`);
    },
    [router],
  );
}
