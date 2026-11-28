import Link from "next/link";
import { FileText, UserRoundCheck } from "lucide-react";

import { CaseStageBadge } from "@/components/cases/case-badges";
import { formatRelative } from "@/lib/format";
import { caseTypeLabel } from "@broker-notes/shared/cases/taxonomy";
import type { CaseListItemDto } from "@broker-notes/shared/dto";
import { formatAudCompact } from "@broker-notes/shared/money";
import { lvrOf } from "@broker-notes/shared/notes/figures";

/** One case in a list (cases page, client page). */
export function CaseCard({
  item,
  hideClient = false,
}: {
  item: CaseListItemDto;
  hideClient?: boolean;
}) {
  const lvr = lvrOf({ loanAmount: item.loanAmount, propertyValue: item.propertyValue });
  return (
    <li>
      <Link
        href={`/cases/${item.id}`}
        aria-label={`Open case ${item.reference}${hideClient ? "" : ` for ${item.client.name}`}`}
        className="bg-card hover:border-primary/40 focus-visible:ring-ring/50 flex h-full flex-col gap-2 rounded-xl border p-4 outline-none focus-visible:ring-2"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-sm font-semibold">{item.reference}</span>
          <CaseStageBadge stage={item.stage} />
        </div>
        {hideClient ? null : <p className="truncate font-medium">{item.client.name}</p>}
        <p className="text-muted-foreground text-sm">
          {caseTypeLabel(item.type)}
          {item.lender ? ` · ${item.lender}` : ""}
        </p>
        {item.loanAmount ? (
          <p className="text-sm tabular-nums">
            {formatAudCompact(item.loanAmount)}
            {lvr !== null ? <span className="text-muted-foreground"> · LVR {lvr}%</span> : null}
          </p>
        ) : null}
        <p className="text-muted-foreground mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs">
          <span className="flex items-center gap-1">
            <FileText className="size-3.5" aria-hidden /> {item.noteCount}{" "}
            {item.noteCount === 1 ? "note" : "notes"}
          </span>
          {item.assignedAdviser ? (
            <span className="flex items-center gap-1">
              <UserRoundCheck className="size-3.5" aria-hidden /> {item.assignedAdviser.name}
            </span>
          ) : null}
          <span>Updated {formatRelative(new Date(item.updatedAt))}</span>
        </p>
      </Link>
    </li>
  );
}
