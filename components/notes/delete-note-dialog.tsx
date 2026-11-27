"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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
import { deleteNoteAction } from "@/server/note-actions";

type DeleteNoteDialogProps = {
  noteId: string;
  noteTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where to go after deleting (e.g. back to the list from the editor). */
  redirectTo?: string;
};

export function DeleteNoteDialog({
  noteId,
  noteTitle,
  open,
  onOpenChange,
  redirectTo,
}: DeleteNoteDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onConfirm = () =>
    startTransition(async () => {
      const res = await deleteNoteAction(noteId);
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't delete the note");
        return;
      }
      onOpenChange(false);
      toast.success("Note deleted");
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{noteTitle}”?</AlertDialogTitle>
          <AlertDialogDescription>
            The note will be removed from your list. For compliance, a record is retained and is not
            permanently erased.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Delete note
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
