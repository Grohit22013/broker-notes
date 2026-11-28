"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTemplateAction } from "@/lib/api/note-extras-actions";

/** "Save as template": the note's current structure becomes a brokerage template. */
export function SaveTemplateDialog({
  noteId,
  open,
  onOpenChange,
  beforeSave,
}: {
  noteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Flush pending edits first, so the template has the latest structure. */
  beforeSave?: () => Promise<void> | void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await beforeSave?.();
      const res = await createTemplateAction({
        noteId,
        name: String(fd.get("name") ?? ""),
        description: String(fd.get("description") ?? ""),
      });
      if (!res.ok) return setError(res.error);
      setError(null);
      onOpenChange(false);
      toast.success(
        `Template “${res.template.name}” saved — everyone in your brokerage can use it`,
      );
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setError(null);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
            <DialogDescription>
              This note&apos;s headings and content become a template for your whole brokerage.
              Remove client-specific details first.
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-w-0 grid-cols-1 gap-2">
            <Label htmlFor="template-name">Template name</Label>
            <Input
              id="template-name"
              name="name"
              required
              autoFocus
              maxLength={60}
              placeholder="e.g. ANZ conditions call"
              className="h-11 text-base md:text-sm"
            />
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-2">
            <Label htmlFor="template-description">Description (optional)</Label>
            <Input
              id="template-description"
              name="description"
              maxLength={200}
              placeholder="When to use it"
              className="h-11 text-base md:text-sm"
            />
          </div>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Save template
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
