"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { moveCaseStageAction } from "@/lib/api/case-actions";
import { cn } from "@/lib/utils";
import {
  CASE_STAGES,
  caseStage,
  caseStageIndex,
  type CaseStageValue,
} from "@broker-notes/shared/cases/taxonomy";

/**
 * The nine-stage pipeline for one case. Past stages are ticked, the current one is highlighted,
 * and (for anyone allowed) clicking a stage moves the case there.
 */
export function StagePipeline({
  caseId,
  stage: initial,
  canMove,
}: {
  caseId: string;
  stage: CaseStageValue;
  canMove: boolean;
}) {
  const router = useRouter();
  const [stage, setStage] = useState(initial);
  const [pending, startTransition] = useTransition();
  const current = caseStageIndex(stage);

  const move = (to: CaseStageValue) => {
    if (to === stage) return;
    const previous = stage;
    setStage(to); // optimistic
    startTransition(async () => {
      const res = await moveCaseStageAction(caseId, to);
      if (!res.ok) {
        setStage(previous);
        toast.error(res.error);
        return;
      }
      toast.success(`Moved to ${caseStage(to).label}`);
      router.refresh();
    });
  };

  return (
    <section aria-labelledby="pipeline-title" className="grid gap-2">
      <h2 id="pipeline-title" className="flex items-center gap-2 text-sm font-semibold">
        Pipeline
        {pending ? <Loader2 className="size-3.5 animate-spin" aria-label="Saving" /> : null}
      </h2>
      <ol className="grid grid-cols-3 gap-1.5 sm:grid-cols-9">
        {CASE_STAGES.map((s, i) => {
          const done = i < current;
          const isCurrent = i === current;
          return (
            <li key={s.value} className="min-w-0">
              <button
                type="button"
                disabled={!canMove || pending}
                onClick={() => move(s.value)}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={isCurrent ? `${s.label} (current stage)` : `Move to ${s.label}`}
                title={s.hint}
                className={cn(
                  "flex h-full min-h-14 w-full flex-col items-start justify-between gap-1 rounded-lg border p-2 text-left text-xs transition-colors",
                  isCurrent && "border-primary bg-primary text-primary-foreground",
                  done && "bg-muted text-muted-foreground",
                  !isCurrent && canMove && "hover:border-primary/50 hover:bg-accent",
                  !canMove && "cursor-default",
                )}
              >
                <span className="flex items-center gap-1 tabular-nums opacity-80">
                  {done ? <Check className="size-3" aria-hidden /> : null}
                  {i + 1}
                </span>
                <span className="font-medium break-words">{s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="text-muted-foreground text-xs">
        {caseStage(stage).hint}. {canMove ? "Choose a stage to move the case." : null}
      </p>
    </section>
  );
}
