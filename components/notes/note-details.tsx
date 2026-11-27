"use client";

import { createContext, use, useCallback, useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pin, Plus, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";

import {
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
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { parseIsoDate, zonedMidnight } from "@/lib/dates";
import { MAX_TAGS, normalizeTags, parseTagInput } from "@/lib/notes/tags";
import {
  LOAN_STAGES,
  NOTE_TYPES,
  type LoanStageValue,
  type NoteTypeValue,
} from "@/lib/notes/taxonomy";
import { cn } from "@/lib/utils";
import { updateNoteMetaAction, type NoteMetaDto } from "@/server/note-actions";

type Patch = Partial<NoteMetaDto>;

type Ctx = {
  meta: NoteMetaDto;
  update: (patch: Patch) => void;
  pending: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  tagSuggestions: string[];
};

const NoteDetailsContext = createContext<Ctx | null>(null);

function useNoteDetails(): Ctx {
  const ctx = use(NoteDetailsContext);
  if (!ctx) throw new Error("useNoteDetails must be used inside <NoteDetailsProvider>");
  return ctx;
}

/** Holds a note's details client-side; applies changes optimistically and saves each one. */
export function NoteDetailsProvider({
  noteId,
  initial,
  tagSuggestions,
  children,
}: {
  noteId: string;
  initial: NoteMetaDto;
  tagSuggestions: string[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [meta, setMeta] = useState(initial);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

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

  const value = useMemo(
    () => ({ meta, update, pending, open, setOpen, tagSuggestions }),
    [meta, update, pending, open, tagSuggestions],
  );
  return <NoteDetailsContext value={value}>{children}</NoteDetailsContext>;
}

/** Button in the editor header that opens the details panel. */
export function NoteDetailsButton() {
  const { setOpen, meta } = useNoteDetails();
  const filled = [meta.loanStage, meta.followUpDate, meta.tags.length || null].filter(
    Boolean,
  ).length;
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
  const empty =
    !meta.pinned &&
    !meta.loanStage &&
    meta.noteType === "GENERAL" &&
    !followUp &&
    meta.tags.length === 0;

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="hover:bg-accent/50 -mx-2 mt-2 flex flex-wrap items-center gap-1.5 rounded-lg px-2 py-1.5 text-left"
      aria-label="Edit note details"
    >
      {empty ? (
        <span className="text-muted-foreground inline-flex items-center gap-1 text-sm">
          <Plus className="size-4" aria-hidden /> Add type, loan stage, follow-up or tags
        </span>
      ) : (
        <>
          {meta.pinned ? <PinnedMark /> : null}
          <TypeBadge type={meta.noteType} />
          {meta.loanStage ? <StageBadge stage={meta.loanStage} /> : null}
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

/** Side sheet on desktop, bottom sheet on phones. */
export function NoteDetailsSheet() {
  const { meta, update, pending, open, setOpen, tagSuggestions } = useNoteDetails();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const ids = useId();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        className={cn(isDesktop ? "w-full sm:max-w-sm" : "pb-safe max-h-[90dvh] rounded-t-2xl")}
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
          <SheetDescription>Used to filter and sort your notes list.</SheetDescription>
        </SheetHeader>

        <div className="grid gap-5 overflow-y-auto px-4 pb-6">
          <Field label="Note type" htmlFor={`${ids}-type`}>
            <Select
              value={meta.noteType}
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
              <div className="flex-1">
                <Input
                  id={`${ids}-followup`}
                  type="date"
                  value={meta.followUpDate ?? ""}
                  onChange={(e) => update({ followUpDate: e.target.value || null })}
                  className="h-11 text-base md:text-sm"
                />
              </div>
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
        </div>
      </SheetContent>
    </Sheet>
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
