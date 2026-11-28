"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  Banknote,
  Check,
  Loader2,
  Lock,
  Pin,
  Plus,
  SlidersHorizontal,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  ClientBadge,
  FigureBadge,
  FollowUpBadge,
  PinnedMark,
  StageBadge,
  TagBadge,
  TypeBadge,
} from "@/components/notes/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { parseIsoDate, zonedMidnight } from "@broker-notes/shared/dates";
import { formatAud, formatAudCompact, parseMoney, parseRate } from "@broker-notes/shared/money";
import { LENDERS, lvrOf, type KeyFigures } from "@broker-notes/shared/notes/figures";
import { MAX_TAGS, normalizeTags, parseTagInput } from "@broker-notes/shared/notes/tags";
import {
  LOAN_STAGES,
  NOTE_TYPES,
  type LoanStageValue,
  type NoteTypeValue,
} from "@broker-notes/shared/notes/taxonomy";
import { cn } from "@/lib/utils";
import { createClientAction } from "@/lib/api/actions";
import { updateNoteMetaAction, type NoteMetaDto } from "@/lib/api/actions";

type Patch = Partial<NoteMetaDto>;
export type ClientOption = { id: string; name: string };

type Ctx = {
  meta: NoteMetaDto;
  update: (patch: Patch) => void;
  pending: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  tagSuggestions: string[];
  clients: ClientOption[];
  addClient: (c: ClientOption) => void;
  locked: boolean;
};

const NoteDetailsContext = createContext<Ctx | null>(null);

export function useNoteDetails(): Ctx {
  const ctx = use(NoteDetailsContext);
  if (!ctx) throw new Error("useNoteDetails must be used inside <NoteDetailsProvider>");
  return ctx;
}

/** Holds a note's details client-side; applies changes optimistically and saves each one. */
export function NoteDetailsProvider({
  noteId,
  initial,
  tagSuggestions,
  clients: initialClients,
  children,
}: {
  noteId: string;
  initial: NoteMetaDto;
  tagSuggestions: string[];
  clients: ClientOption[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [meta, setMeta] = useState(initial);
  const [clients, setClients] = useState(initialClients);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Server is the source of truth for status (e.g. after finalising).
  useEffect(() => setMeta((m) => ({ ...m, status: initial.status })), [initial.status]);

  const update = useCallback(
    (patch: Patch) => {
      const previous = meta;
      setMeta((m) => ({ ...m, ...patch })); // optimistic
      startTransition(async () => {
        const res = await updateNoteMetaAction({ id: noteId, ...patch });
        if (!res.ok) {
          setMeta(previous);
          toast.error(res.error);
          return;
        }
        setMeta(res.meta); // server-normalised (e.g. de-duplicated tags)
        router.refresh();
      });
    },
    [meta, noteId, router],
  );

  const addClient = useCallback(
    (c: ClientOption) =>
      setClients((list) => [...list, c].sort((a, b) => a.name.localeCompare(b.name, "en-AU"))),
    [],
  );

  const value = useMemo(
    () => ({
      meta,
      update,
      pending,
      open,
      setOpen,
      tagSuggestions,
      clients,
      addClient,
      locked: meta.status === "FINALISED",
    }),
    [meta, update, pending, open, tagSuggestions, clients, addClient],
  );
  return <NoteDetailsContext value={value}>{children}</NoteDetailsContext>;
}

/** Button in the editor header that opens the details panel. */
export function NoteDetailsButton() {
  const { setOpen, meta } = useNoteDetails();
  const filled = [
    meta.clientId,
    meta.loanStage,
    meta.followUpDate,
    meta.tags.length || null,
    Object.keys(meta.keyFigures).length || null,
  ].filter(Boolean).length;
  return (
    <Button variant="outline" size="sm" className="h-10" onClick={() => setOpen(true)}>
      <SlidersHorizontal className="size-4" aria-hidden />
      Details
      {filled ? (
        <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-xs tabular-nums">
          {filled}
        </span>
      ) : null}
    </Button>
  );
}

/** Badges shown under the note title; tapping them opens the panel. */
export function NoteDetailsSummary() {
  const { meta, setOpen } = useNoteDetails();
  const followUp = meta.followUpDate ? parseIsoDate(meta.followUpDate) : null;
  const k = meta.keyFigures;
  const lvr = lvrOf(k);
  const empty =
    !meta.pinned &&
    !meta.clientId &&
    !meta.loanStage &&
    meta.noteType === "GENERAL" &&
    !followUp &&
    meta.tags.length === 0 &&
    Object.keys(k).length === 0;

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="hover:bg-accent/50 -mx-2 mt-2 flex flex-wrap items-center gap-1.5 rounded-lg px-2 py-1.5 text-left"
      aria-label="Edit note details"
    >
      {empty ? (
        <span className="text-muted-foreground inline-flex items-center gap-1 text-sm">
          <Plus className="size-4" aria-hidden /> Add client, loan stage, figures, follow-up or tags
        </span>
      ) : (
        <>
          {meta.pinned ? <PinnedMark /> : null}
          {meta.clientName ? <ClientBadge name={meta.clientName} /> : null}
          <TypeBadge type={meta.noteType} />
          {meta.loanStage ? <StageBadge stage={meta.loanStage} /> : null}
          {k.loanAmount ? (
            <FigureBadge>
              {formatAudCompact(k.loanAmount)}
              {lvr !== null ? ` · ${lvr}% LVR` : ""}
            </FigureBadge>
          ) : null}
          {k.lender ? <FigureBadge>{k.lender}</FigureBadge> : null}
          {followUp ? <FollowUpBadge date={zonedMidnight(followUp)} /> : null}
          {meta.tags.map((t) => (
            <TagBadge key={t} tag={t} />
          ))}
        </>
      )}
    </button>
  );
}

const NONE = "none";
const NEW_CLIENT = "__new__";

/** Side sheet on desktop, bottom sheet on phones. */
export function NoteDetailsSheet() {
  const { meta, update, pending, open, setOpen, tagSuggestions, locked } = useNoteDetails();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const ids = useId();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        className={cn(
          "gap-0",
          isDesktop ? "w-full sm:max-w-md" : "pb-safe max-h-[90dvh] rounded-t-2xl",
        )}
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Note details
            <span className="text-muted-foreground flex items-center gap-1 text-xs font-normal">
              {pending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden /> Saving…
                </>
              ) : (
                <>
                  <Check className="size-3.5" aria-hidden /> Saved
                </>
              )}
            </span>
          </SheetTitle>
          <SheetDescription>Used to organise, filter and export your notes.</SheetDescription>
        </SheetHeader>

        <div className="grid gap-5 overflow-y-auto px-4 pb-8">
          {locked ? (
            <p className="bg-muted text-muted-foreground flex gap-2 rounded-md p-3 text-sm">
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
              This note is finalised: client, type and figures are locked. You can still update the
              loan stage, follow-up, tags and pin.
            </p>
          ) : null}

          <ClientField />

          <Field label="Note type" htmlFor={`${ids}-type`}>
            <Select
              value={meta.noteType}
              disabled={locked}
              onValueChange={(v) => update({ noteType: v as NoteTypeValue })}
            >
              <SelectTrigger id={`${ids}-type`} className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Loan stage" htmlFor={`${ids}-stage`}>
            <Select
              value={meta.loanStage ?? NONE}
              onValueChange={(v) =>
                update({ loanStage: v === NONE ? null : (v as LoanStageValue) })
              }
            >
              <SelectTrigger id={`${ids}-stage`} className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not set</SelectItem>
                {LOAN_STAGES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Follow-up date" htmlFor={`${ids}-followup`}>
            <div className="flex gap-2">
              <Input
                id={`${ids}-followup`}
                type="date"
                value={meta.followUpDate ?? ""}
                onChange={(e) => update({ followUpDate: e.target.value || null })}
                className="h-11 flex-1 text-base md:text-sm"
              />
              {meta.followUpDate ? (
                <Button
                  variant="ghost"
                  className="h-11"
                  onClick={() => update({ followUpDate: null })}
                  aria-label="Clear follow-up date"
                >
                  <X className="size-4" />
                </Button>
              ) : null}
            </div>
          </Field>

          <TagsField
            id={`${ids}-tags`}
            tags={meta.tags}
            suggestions={tagSuggestions}
            onChange={(tags) => update({ tags })}
          />

          <Button
            variant={meta.pinned ? "secondary" : "outline"}
            className="h-11 justify-start"
            aria-pressed={meta.pinned}
            onClick={() => update({ pinned: !meta.pinned })}
          >
            <Pin className={cn("size-4", meta.pinned && "fill-current")} aria-hidden />
            {meta.pinned ? "Pinned to top of your list" : "Pin to top of your list"}
          </Button>

          <Separator />
          <KeyFiguresFields />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ClientField() {
  const { meta, update, clients, addClient, locked } = useNoteDetails();
  const id = useId();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [saving, startSaving] = useTransition();

  const create = () =>
    startSaving(async () => {
      const res = await createClientAction({ name });
      if (!res.ok) return void toast.error(res.error);
      addClient({ id: res.client.id, name: res.client.name });
      update({ clientId: res.client.id, clientName: res.client.name });
      setCreating(false);
      setName("");
      toast.success(`Client “${res.client.name}” added`);
    });

  return (
    <Field label="Client" htmlFor={id}>
      {creating ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create();
          }}
        >
          <Input
            id={id}
            autoFocus
            placeholder="Client or household name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11 flex-1 text-base md:text-sm"
          />
          <Button type="submit" className="h-11" disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Add"}
          </Button>
          <Button type="button" variant="ghost" className="h-11" onClick={() => setCreating(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <Select
          value={meta.clientId ?? NONE}
          disabled={locked}
          onValueChange={(v) => {
            if (v === NEW_CLIENT) return setCreating(true);
            const c = clients.find((x) => x.id === v);
            update({ clientId: c?.id ?? null, clientName: c?.name ?? null });
          }}
        >
          <SelectTrigger id={id} className="h-11 w-full">
            <span className="flex items-center gap-2 truncate">
              <User className="text-muted-foreground size-4 shrink-0" aria-hidden />
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No client</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
            <SelectSeparator />
            <SelectItem value={NEW_CLIENT}>+ New client…</SelectItem>
          </SelectContent>
        </Select>
      )}
    </Field>
  );
}

function KeyFiguresFields() {
  const { meta, update, locked } = useNoteDetails();
  const ids = useId();
  const k = meta.keyFigures;
  const lvr = lvrOf(k);

  const setFigure = (patch: Partial<KeyFigures>) => update({ keyFigures: { ...k, ...patch } });

  return (
    <section aria-labelledby={`${ids}-kf`} className="grid gap-4">
      <div className="flex items-center gap-2">
        <Banknote className="text-primary size-4" aria-hidden />
        <h3 id={`${ids}-kf`} className="text-sm font-semibold">
          Key loan figures
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <MoneyField
          label="Loan amount"
          value={k.loanAmount ?? null}
          disabled={locked}
          onCommit={(v) => setFigure({ loanAmount: v })}
        />
        <MoneyField
          label="Property value"
          value={k.propertyValue ?? null}
          disabled={locked}
          onCommit={(v) => setFigure({ propertyValue: v })}
        />
      </div>
      <div
        className={cn(
          "rounded-md border px-3 py-2 text-sm",
          lvr !== null && lvr > 80 ? "border-amber-300 bg-amber-50 dark:bg-amber-950/40" : "",
        )}
        aria-live="polite"
      >
        <span className="text-muted-foreground">LVR: </span>
        <span className="font-semibold tabular-nums">{lvr !== null ? `${lvr}%` : "—"}</span>
        {lvr !== null && lvr > 80 ? (
          <span className="text-muted-foreground"> · above 80%, LMI likely applies</span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <MoneyField
          label="Household income (p.a.)"
          value={k.income ?? null}
          disabled={locked}
          onCommit={(v) => setFigure({ income: v })}
        />
        <TextFigure
          label="Rate (% p.a.)"
          value={k.rate !== null && k.rate !== undefined ? String(k.rate) : ""}
          placeholder="6.19"
          inputMode="decimal"
          disabled={locked}
          parse={parseRate}
          error="Enter a rate between 0 and 30"
          onCommit={(v) => setFigure({ rate: v as number | null })}
        />
      </div>
      <TextFigure
        label="Lender"
        value={k.lender ?? ""}
        placeholder="e.g. ANZ"
        list={`${ids}-lenders`}
        disabled={locked}
        parse={(s) => s.trim().slice(0, 60)}
        onCommit={(v) => setFigure({ lender: (v as string) || null })}
      />
      <datalist id={`${ids}-lenders`}>
        {LENDERS.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
    </section>
  );
}

/** Money input: accepts "850k", "$1.2m", "850,000"; shows the formatted value when not editing. */
function MoneyField({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: number | null;
  disabled?: boolean;
  onCommit: (v: number | null) => void;
}) {
  return (
    <TextFigure
      label={label}
      value={value !== null ? formatAud(value) : ""}
      placeholder="e.g. 850k"
      inputMode="decimal"
      disabled={disabled}
      parse={parseMoney}
      error="Try a number like 850000, 850k or 1.2m"
      onCommit={(v) => onCommit(v as number | null)}
      compare={value}
    />
  );
}

function TextFigure({
  label,
  value,
  placeholder,
  inputMode,
  list,
  disabled,
  parse,
  error,
  onCommit,
  compare,
}: {
  label: string;
  value: string;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  list?: string;
  disabled?: boolean;
  parse: (s: string) => number | string | null;
  error?: string;
  onCommit: (v: number | string | null) => void;
  /** The stored value, to skip saving when nothing changed. */
  compare?: number | string | null;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  const commit = () => {
    if (draft === null) return;
    const trimmed = draft.trim();
    const parsed = trimmed === "" ? null : parse(trimmed);
    if (trimmed !== "" && (parsed === null || parsed === "")) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setDraft(null);
    if (parsed !== (compare === undefined ? value : compare)) onCommit(parsed);
  };

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        value={draft ?? value}
        placeholder={placeholder}
        inputMode={inputMode}
        list={list}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        // Start editing from the raw number — but never clobber a draft the broker is already typing.
        onFocus={() => setDraft((d) => d ?? value.replace(/[$,]/g, ""))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="h-11 text-base tabular-nums md:text-sm"
      />
      {invalid && error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function TagsField({
  id,
  tags,
  suggestions,
  onChange,
}: {
  id: string;
  tags: string[];
  suggestions: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const full = tags.length >= MAX_TAGS;

  const commit = (value: string) => {
    const next = normalizeTags([...tags, ...parseTagInput(value)]);
    setDraft("");
    if (next.length !== tags.length) onChange(next);
  };

  const unused = suggestions.filter((s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()));

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>
        Tags{" "}
        <span className="text-muted-foreground font-normal">
          ({tags.length}/{MAX_TAGS})
        </span>
      </Label>
      {tags.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Current tags">
          {tags.map((t) => (
            <li key={t}>
              <span className="bg-muted inline-flex h-8 items-center gap-1 rounded-full pr-1 pl-3 text-sm">
                #{t}
                <button
                  type="button"
                  className="hover:bg-background grid size-6 place-items-center rounded-full"
                  onClick={() => onChange(tags.filter((x) => x !== t))}
                  aria-label={`Remove tag ${t}`}
                >
                  <X className="size-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <Input
        id={id}
        list={`${id}-suggestions`}
        value={draft}
        disabled={full}
        enterKeyHint="done"
        placeholder={full ? "Tag limit reached" : "e.g. refinance, first home buyer"}
        onChange={(e) => {
          const v = e.target.value;
          if (v.includes(",")) commit(v);
          else setDraft(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (draft.trim()) commit(draft);
          } else if (e.key === "Backspace" && !draft && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => draft.trim() && commit(draft)}
        className="h-11 text-base md:text-sm"
      />
      <datalist id={`${id}-suggestions`}>
        {unused.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <p className="text-muted-foreground text-xs">Press Enter or comma to add a tag.</p>
    </div>
  );
}
