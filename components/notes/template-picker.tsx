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
} from "lucide-react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { createNoteAction } from "@/server/note-actions";

export type TemplateCard = { id: string; name: string; description: string };

const ICONS: Record<string, LucideIcon> = {
  blank: FilePlus2,
  discovery: MessagesSquare,
  "fact-find": ClipboardList,
  "lender-rationale": Scale,
  conditions: FileText,
  settlement: CalendarCheck,
  review: RefreshCcw,
};

const NO_CLIENT = "none";

export function TemplatePicker({
  templates,
  clients,
  defaultClientId,
}: {
  templates: TemplateCard[];
  clients: { id: string; name: string }[];
  defaultClientId?: string;
}) {
  const [clientId, setClientId] = useState(defaultClientId ?? NO_CLIENT);

  return (
    <div className="space-y-6">
      {clients.length ? (
        <div className="grid max-w-sm gap-2">
          <Label htmlFor="new-note-client">For client (optional)</Label>
          <Select value={clientId} onValueChange={setClientId}>
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
        </div>
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Note templates">
        {templates.map((t) => (
          <li key={t.id}>
            <form action={createNoteAction} className="h-full">
              <input type="hidden" name="templateId" value={t.id} />
              {clientId !== NO_CLIENT ? (
                <input type="hidden" name="clientId" value={clientId} />
              ) : null}
              <TemplateButton template={t} icon={ICONS[t.id] ?? FileText} />
            </form>
          </li>
        ))}
      </ul>
    </div>
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
