"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardCopy,
  ListChecks,
  CalendarSearch,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TextQuote,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { batchTasksAction } from "@/lib/api/task-actions";
import type { NoteAnalysisDto, RedactionCounts } from "@broker-notes/shared/dto";
import { lvrOf, type KeyFigures } from "@broker-notes/shared/notes/figures";
import { formatAud } from "@broker-notes/shared/money";

import type { NoteEditorApi } from "@/components/editor/note-editor";
import { useNoteDetails } from "@/components/notes/note-details";
import { SpottedDates } from "@/components/notes/spotted-dates";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { analyseNote, getAiStatus, getLatestAnalysis } from "@/lib/api/actions";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

type Status = Awaited<ReturnType<typeof getAiStatus>>;

const REDACTION_LABELS: Record<keyof RedactionCounts, [string, string]> = {
  tfn: ["TFN", "TFNs"],
  medicare: ["Medicare number", "Medicare numbers"],
  card: ["card number", "card numbers"],
  bank: ["bank account", "bank accounts"],
  phone: ["phone number", "phone numbers"],
  email: ["email address", "email addresses"],
};

function describeRedactions(r: RedactionCounts | null): string | null {
  if (!r) return null;
  const parts = (Object.keys(r) as (keyof RedactionCounts)[])
    .filter((k) => r[k] > 0)
    .map((k) => `${r[k]} ${REDACTION_LABELS[k][r[k] === 1 ? 0 : 1]}`);
  return parts.length ? parts.join(", ") : null;
}

const FIGURE_ROWS: {
  key: keyof KeyFigures;
  label: string;
  format: (v: number | string) => string;
}[] = [
  { key: "loanAmount", label: "Loan amount", format: (v) => formatAud(Number(v)) },
  { key: "propertyValue", label: "Property value", format: (v) => formatAud(Number(v)) },
  { key: "income", label: "Household income", format: (v) => formatAud(Number(v)) },
  { key: "rate", label: "Rate", format: (v) => `${v}% p.a.` },
  { key: "lender", label: "Lender", format: (v) => String(v) },
];

/**
 * "AI assist": one structured analysis per click with a free OpenRouter model, run by the API.
 * Everything shown is a draft labelled AI-generated; the note only changes when the broker clicks
 * Insert / Apply. Identifiers are removed server-side before anything is sent.
 */
export function AiPanel({
  noteId,
  editorApi,
  finalised,
}: {
  noteId: string;
  editorApi: NoteEditorApi | null;
  finalised: boolean;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { meta, update } = useNoteDetails();
  const router = useRouter();
  const [creatingTasks, startCreatingTasks] = useTransition();
  const createTasks = (titles: string[]) =>
    startCreatingTasks(async () => {
      const res = await batchTasksAction({ noteId, titles: titles.slice(0, 20) });
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Created ${res.created} task${res.created === 1 ? "" : "s"} — see Tasks`);
      router.refresh();
    });
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [result, setResult] = useState<NoteAnalysisDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [running, startRunning] = useTransition();

  useEffect(() => {
    if (!open) return;
    startLoading(async () => {
      const [s, latest] = await Promise.all([getAiStatus(), getLatestAnalysis(noteId)]);
      setStatus(s);
      setResult(latest);
    });
  }, [open, noteId]);

  const run = useCallback(
    (force: boolean) =>
      startRunning(async () => {
        setError(null);
        // Save pending edits first so the analysis sees the latest text.
        await editorApi?.flush();
        const res = await analyseNote(noteId, force);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setResult(res.result);
        setStatus((s) => (s ? { ...s, remaining: res.result.remaining } : s));
      }),
    [editorApi, noteId],
  );

  const a = result?.analysis;
  const suggested = a?.keyFigures;
  const differing = suggested
    ? FIGURE_ROWS.filter(
        ({ key }) =>
          suggested[key] !== null &&
          suggested[key] !== undefined &&
          suggested[key] !== meta.keyFigures[key],
      )
    : [];
  const redactionText = describeRedactions(result?.redactions ?? null);

  const applyFigures = () => {
    if (!suggested) return;
    const next: KeyFigures = { ...meta.keyFigures };
    for (const { key } of differing) (next as Record<string, unknown>)[key] = suggested[key];
    update({ keyFigures: next });
    toast.success("Key figures applied to note details");
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-10"
        aria-label="AI assist"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="text-primary size-4" aria-hidden />
        <span className="hidden sm:inline">AI assist</span>
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={isDesktop ? "right" : "bottom"}
          className={cn(
            "gap-0",
            isDesktop ? "w-full sm:max-w-lg" : "pb-safe max-h-[90dvh] rounded-t-2xl",
          )}
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="text-primary size-5" aria-hidden /> AI assist
            </SheetTitle>
            <SheetDescription>
              Summary, action items, key figures and a Best Interests (RG 273) check — as drafts you
              review.
            </SheetDescription>
          </SheetHeader>

          <div className="grid gap-4 overflow-y-auto px-4 pb-8">
            <p className="bg-muted text-muted-foreground flex gap-2 rounded-md p-3 text-xs leading-relaxed">
              <ShieldCheck className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Before anything is sent, TFNs, Medicare, card and bank numbers, phone numbers and
                emails are removed. Uses a free model
                {status?.model ? (
                  <>
                    {" "}
                    (<code className="text-[11px]">{status.model}</code>)
                  </>
                ) : null}{" "}
                via OpenRouter; free providers may log prompts. Nothing changes in your note until
                you click Insert or Apply.
              </span>
            </p>

            {loading && !status ? (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
              </div>
            ) : status && !status.enabled ? (
              <p className="text-sm" role="status">
                AI isn&apos;t configured on this server (no OpenRouter key).
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={() => run(Boolean(result && !result.stale))}
                  disabled={running || (status?.remaining ?? 1) === 0}
                  className="h-11"
                >
                  {running ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : result ? (
                    <RefreshCw className="size-4" aria-hidden />
                  ) : (
                    <Sparkles className="size-4" aria-hidden />
                  )}
                  {running ? "Analysing…" : result ? "Re-analyse" : "Analyse note"}
                </Button>
                {status ? (
                  <span className="text-muted-foreground text-xs">
                    {status.remaining} of {status.dailyLimit} analyses left today
                  </span>
                ) : null}
              </div>
            )}

            {running ? (
              <p className="text-muted-foreground text-xs" role="status">
                Free models usually take 10–30 seconds.
              </p>
            ) : null}
            {error ? (
              <p
                className="border-destructive/30 bg-destructive/5 text-destructive flex gap-2 rounded-md border p-3 text-sm"
                role="alert"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </p>
            ) : null}

            {a && result ? (
              <div className="grid gap-4" aria-live="polite">
                <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                  <span className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium">
                    <Sparkles className="size-3" aria-hidden /> AI-generated
                  </span>
                  <span>{formatRelative(new Date(result.analysedAt))}</span>
                  {result.cached && !result.stale ? <span>· cached (note unchanged)</span> : null}
                  {result.stale ? (
                    <span className="text-amber-700 dark:text-amber-400">
                      · note changed since — re-analyse
                    </span>
                  ) : null}
                </div>
                {redactionText ? (
                  <p className="text-xs">
                    <ShieldCheck className="mr-1 inline size-3.5 text-emerald-600" aria-hidden />
                    Removed before sending: {redactionText}.
                  </p>
                ) : null}

                <Section title="Summary" icon={TextQuote}>
                  <p className="text-sm leading-relaxed">{a.summary}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        await navigator.clipboard.writeText(a.summary);
                        toast.success("Summary copied");
                      }}
                    >
                      <ClipboardCopy className="size-4" aria-hidden /> Copy
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={finalised || !editorApi}
                      onClick={() => {
                        editorApi?.insertSection("Summary", a.summary);
                        toast.success("Summary added to the end of the note");
                      }}
                    >
                      Insert into note
                    </Button>
                  </div>
                </Section>

                <Section title="Action items" icon={ListChecks}>
                  {a.actionItems.length ? (
                    <>
                      <ul className="grid gap-1.5 text-sm">
                        {a.actionItems.map((item, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="border-muted-foreground/40 mt-1 size-3.5 shrink-0 rounded-sm border" />
                            <span>
                              {item.text}
                              {item.due ? (
                                <span className="text-muted-foreground"> · due {item.due}</span>
                              ) : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        disabled={finalised || !editorApi}
                        onClick={() => {
                          editorApi?.insertChecklist(
                            "Action items",
                            a.actionItems.map((i) => (i.due ? `${i.text} (due ${i.due})` : i.text)),
                          );
                          toast.success("Action items added as a checklist");
                        }}
                      >
                        Insert as checklist
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 ml-2"
                        disabled={creatingTasks}
                        onClick={() => createTasks(a.actionItems.map((i) => i.text))}
                      >
                        Create tasks
                      </Button>
                    </>
                  ) : (
                    <p className="text-muted-foreground text-sm">No action items found.</p>
                  )}
                </Section>

                <Section title="Dates found" icon={CalendarSearch}>
                  <SpottedDates
                    key={result?.analysedAt}
                    noteId={noteId}
                    dates={a.dates ?? []}
                    canEditNote={!finalised}
                    onSetMeeting={(meetingAt) => update({ meetingAt })}
                    onSetFollowUp={(followUpDate) => update({ followUpDate })}
                    existing={{ meetingAt: meta.meetingAt, followUpDate: meta.followUpDate }}
                  />
                </Section>

                <Section title="Key figures" icon={CheckCircle2}>
                  {FIGURE_ROWS.some(
                    ({ key }) => suggested?.[key] !== null && suggested?.[key] !== undefined,
                  ) ? (
                    <>
                      <table className="w-full text-sm">
                        <thead className="text-muted-foreground text-left text-xs">
                          <tr>
                            <th className="py-1 font-medium">Field</th>
                            <th className="py-1 font-medium">In note</th>
                            <th className="py-1 font-medium">Suggested</th>
                          </tr>
                        </thead>
                        <tbody>
                          {FIGURE_ROWS.filter(
                            ({ key }) =>
                              suggested?.[key] !== null && suggested?.[key] !== undefined,
                          ).map(({ key, label, format }) => {
                            const current = meta.keyFigures[key];
                            const next = suggested![key]!;
                            const same = current === next;
                            return (
                              <tr key={key} className="border-t">
                                <td className="py-1.5">{label}</td>
                                <td className="text-muted-foreground py-1.5">
                                  {current !== null && current !== undefined
                                    ? format(current)
                                    : "—"}
                                </td>
                                <td className={cn("py-1.5", !same && "font-medium")}>
                                  {format(next)}{" "}
                                  {same ? (
                                    <Check
                                      className="inline size-3.5 text-emerald-600"
                                      aria-label="matches"
                                    />
                                  ) : null}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {lvrOf(suggested ?? {}) !== null ? (
                        <p className="text-muted-foreground mt-2 text-xs">
                          Suggested LVR: {lvrOf(suggested ?? {})}%
                        </p>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        disabled={finalised || differing.length === 0}
                        onClick={applyFigures}
                      >
                        {differing.length === 0
                          ? "Already in note details"
                          : `Apply ${differing.length} to details`}
                      </Button>
                      {finalised ? (
                        <p className="text-muted-foreground mt-2 text-xs">
                          Finalised notes keep their recorded figures.
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-muted-foreground text-sm">No figures found in the note.</p>
                  )}
                </Section>

                <Section title="Best Interests check (RG 273)" icon={ShieldCheck}>
                  <p
                    className={cn(
                      "mb-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                      a.bestInterests.status === "ok"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
                    )}
                  >
                    {a.bestInterests.status === "ok" ? "Looks complete" : "Needs attention"}
                  </p>
                  {a.bestInterests.issues.length ? (
                    <ul className="grid list-disc gap-1 pl-5 text-sm">
                      {a.bestInterests.issues.map((issue, i) => (
                        <li key={i}>{issue}</li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="text-muted-foreground mt-2 text-xs">
                    A prompt for your own judgement — not compliance advice.
                  </p>
                </Section>
              </div>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Sparkles;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border p-4" aria-label={title}>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Icon className="text-primary size-4" aria-hidden /> {title}
      </h3>
      {children}
    </section>
  );
}
