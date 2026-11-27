"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LockKeyhole } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { finaliseNoteAction } from "@/server/note-actions";

/**
 * Locks the note as a compliance record. Pending edits are flushed first — server actions run
 * in order, so the finalise call only happens after the last autosave has landed.
 */
export function FinaliseButton({
  noteId,
  beforeFinalise,
}: {
  noteId: string;
  beforeFinalise: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const finalise = () =>
    startTransition(async () => {
      beforeFinalise();
      const res = await finaliseNoteAction(noteId);
      if (!res.ok) return void toast.error(res.error);
      setOpen(false);
      toast.success("Note finalised and locked");
      router.refresh();
    });

  return (
    <>
      <Button size="sm" className="h-10" aria-label="Finalise" onClick={() => setOpen(true)}>
        <LockKeyhole className="size-4" aria-hidden />
        <span className="hidden sm:inline">Finalise</span>
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalise this file note?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  The title, body, client, note type and key figures will be <strong>locked</strong>{" "}
                  and a final version recorded with today&apos;s date and time.
                </p>
                <p>
                  Later corrections are added as <strong>timestamped amendments</strong>, so the
                  original record is never silently changed (ASIC RG 273). This can&apos;t be
                  undone.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep editing</AlertDialogCancel>
            <Button onClick={finalise} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Finalise note
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
