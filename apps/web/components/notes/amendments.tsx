"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PenLine } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { AMENDMENT_MAX } from "@broker-notes/shared/notes/finalise";
import { addAmendmentAction } from "@/lib/api/actions";

export type AmendmentView = { id: string; body: string; createdAt: string };

/** Append-only amendments shown under a finalised note. */
export function Amendments({ noteId, initial }: { noteId: string; initial: AmendmentView[] }) {
  const router = useRouter();
  const id = useId();
  const [items, setItems] = useState(initial);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await addAmendmentAction({ noteId, body: draft });
      if (!res.ok) return void toast.error(res.error);
      setItems((list) => [...list, res.amendment]);
      setDraft("");
      toast.success("Amendment added");
      router.refresh();
    });
  };

  return (
    <section aria-labelledby={`${id}-title`} className="mt-10 border-t pt-6">
      <h2 id={`${id}-title`} className="flex items-center gap-2 text-lg font-semibold">
        <PenLine className="text-primary size-5" aria-hidden />
        Amendments
      </h2>
      <p className="text-muted-foreground mt-1 text-sm">
        Corrections and additions after finalising. Each one is timestamped and can&apos;t be edited
        or deleted.
      </p>

      {items.length ? (
        <ol className="mt-4 space-y-3">
          {items.map((a, i) => (
            <li key={a.id} className="bg-muted/50 rounded-lg border p-4">
              <p className="text-muted-foreground mb-1 text-xs">
                Amendment {i + 1} ·{" "}
                <time dateTime={a.createdAt}>{formatDateTime(new Date(a.createdAt))}</time>
              </p>
              <p className="text-sm whitespace-pre-wrap">{a.body}</p>
            </li>
          ))}
        </ol>
      ) : null}

      <form onSubmit={submit} className="mt-4 space-y-2">
        <Label htmlFor={id}>Add an amendment</Label>
        <Textarea
          id={id}
          value={draft}
          maxLength={AMENDMENT_MAX}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. Client confirmed on 2 Dec that the deposit includes a $20k gift from parents."
          className="min-h-24 text-base md:text-sm"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs tabular-nums">
            {draft.length}/{AMENDMENT_MAX}
          </span>
          <Button type="submit" className="h-10" disabled={pending || !draft.trim()}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Add amendment
          </Button>
        </div>
      </form>
    </section>
  );
}
