"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import {
  CalendarCheck,
  ClipboardList,
  FilePlus2,
  FileText,
  Loader2,
  MessagesSquare,
  RefreshCcw,
  Scale,
  type LucideIcon,
  Landmark,
  LayoutTemplate,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useCreateNoteAction } from "@/hooks/use-create-note";
import { removeTemplateAction } from "@/lib/api/note-extras-actions";

export type TemplateCard = { id: string; name: string; description: string };

const ICONS: Record<string, LucideIcon> = {
  blank: FilePlus2,
  discovery: MessagesSquare,
  "fact-find": ClipboardList,
  "lender-rationale": Scale,
  conditions: FileText,
  settlement: CalendarCheck,
  review: RefreshCcw,
  "lender-update": Landmark,
  "client-meeting": Users,
};

const NO_CLIENT = "none";

export function TemplatePicker({
  templates,
  clients,
  defaultClientId,
  forCase,
  orgTemplates = [],
}: {
  templates: TemplateCard[];
  clients: { id: string; name: string }[];
  defaultClientId?: string;
  /** Creating the note for this case (its client is fixed). */
  forCase?: { id: string; reference: string };
  /** The brokerage's own templates (saved from notes). */
  orgTemplates?: (TemplateCard & { canRemove: boolean; createdBy: string })[];
}) {
  const [clientId, setClientId] = useState(defaultClientId ?? NO_CLIENT);
  const createNote = useCreateNoteAction();

  return (
    <div className="space-y-6">
      {clients.length ? (
        <div className="grid max-w-sm gap-2">
          <Label htmlFor="new-note-client">For client (optional)</Label>
          <Select value={clientId} onValueChange={setClientId} disabled={Boolean(forCase)}>
            <SelectTrigger id="new-note-client" className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CLIENT}>No client</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {forCase ? (
            <p className="text-muted-foreground text-sm">
              For case{" "}
              <span className="text-foreground font-mono font-medium">{forCase.reference}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      <ul
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        aria-label="Note templates"
      >
        {templates.map((t) => (
          <li key={t.id}>
            <form action={createNote} className="h-full">
              <input type="hidden" name="templateId" value={t.id} />
              {forCase ? <input type="hidden" name="caseId" value={forCase.id} /> : null}
              {clientId !== NO_CLIENT ? (
                <input type="hidden" name="clientId" value={clientId} />
              ) : null}
              <TemplateButton template={t} icon={ICONS[t.id] ?? FileText} />
            </form>
          </li>
        ))}
      </ul>

      {orgTemplates.length ? (
        <section aria-labelledby="org-templates" className="grid gap-3">
          <h2 id="org-templates" className="text-lg font-semibold">
            Your brokerage&apos;s templates
          </h2>
          <ul
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
            aria-label="Brokerage templates"
          >
            {orgTemplates.map((t) => (
              <li key={t.id} className="relative">
                <form action={createNote} className="h-full">
                  <input type="hidden" name="templateId" value={t.id} />
                  {forCase ? <input type="hidden" name="caseId" value={forCase.id} /> : null}
                  {clientId !== NO_CLIENT ? (
                    <input type="hidden" name="clientId" value={clientId} />
                  ) : null}
                  <TemplateButton
                    template={{ ...t, description: t.description || `Saved by ${t.createdBy}` }}
                    icon={LayoutTemplate}
                  />
                </form>
                {t.canRemove ? <RemoveTemplateButton id={t.id} name={t.name} /> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function RemoveTemplateButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="absolute top-2 right-2 size-9"
      aria-label={`Remove template ${name}`}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await removeTemplateAction(id);
        setBusy(false);
        if (!res.ok) return void toast.error(res.error);
        toast.success(`Template “${name}” removed`);
        router.refresh();
      }}
    >
      <X className="size-4" aria-hidden />
    </Button>
  );
}

function TemplateButton({ template, icon: Icon }: { template: TemplateCard; icon: LucideIcon }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={`Create note from template: ${template.name}`}
      className={cn(
        "bg-card hover:border-primary/50 focus-visible:ring-ring/50 flex h-full w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors outline-none focus-visible:ring-2 md:p-5",
        pending && "opacity-60",
      )}
    >
      <span className="bg-accent text-primary grid size-10 shrink-0 place-items-center rounded-lg">
        {pending ? <Loader2 className="size-5 animate-spin" /> : <Icon className="size-5" />}
      </span>
      <span>
        <span className="block font-medium">{template.name}</span>
        <span className="text-muted-foreground mt-0.5 block text-sm">{template.description}</span>
      </span>
    </button>
  );
}
