"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createCaseAction, updateCaseAction } from "@/lib/api/case-actions";
import {
  CASE_STAGES,
  CASE_TYPES,
  type CaseStageValue,
  type CaseTypeValue,
} from "@broker-notes/shared/cases/taxonomy";
import type { CaseDetailDto, UserRefDto } from "@broker-notes/shared/dto";
import { formatAud, parseMoney } from "@broker-notes/shared/money";
import { LENDERS } from "@broker-notes/shared/notes/figures";

const NONE = "__none__";

type Props = {
  trigger: React.ReactNode;
  /** Edit this case; otherwise open a new one. */
  existing?: CaseDetailDto;
  /** Clients to choose from when opening a case (ignored when editing). */
  clients?: { id: string; name: string }[];
  /** Pre-selected client (e.g. opened from the client page). */
  defaultClientId?: string;
  advisers: UserRefDto[];
};

export function CaseFormDialog({
  trigger,
  existing,
  clients = [],
  defaultClientId,
  advisers,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [clientId, setClientId] = useState(existing?.client.id ?? defaultClientId ?? "");
  const [type, setType] = useState<CaseTypeValue | "">(existing?.type ?? "");
  const [stage, setStage] = useState<CaseStageValue>(existing?.stage ?? "ENQUIRY");
  const [adviserId, setAdviserId] = useState(existing?.assignedAdviser?.id ?? NONE);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const money = (name: string) => {
      const raw = String(fd.get(name) ?? "").trim();
      if (!raw) return { ok: true as const, value: null };
      const value = parseMoney(raw);
      return value === null ? { ok: false as const } : { ok: true as const, value };
    };
    const loan = money("loanAmount");
    const property = money("propertyValue");
    if (!loan.ok || !property.ok) {
      return setError({
        field: !loan.ok ? "loanAmount" : "propertyValue",
        message: "Enter an amount like 650000, 650k or $1.2m",
      });
    }
    if (!existing && !clientId) return setError({ field: "clientId", message: "Choose a client" });
    if (!type) return setError({ field: "type", message: "Choose a loan type" });

    const details = {
      type,
      stage,
      lender: String(fd.get("lender") ?? ""),
      lenderReference: String(fd.get("lenderReference") ?? ""),
      loanAmount: loan.value,
      propertyValue: property.value,
      assignedAdviserId: adviserId === NONE ? null : adviserId,
    };
    startTransition(async () => {
      const res = existing
        ? await updateCaseAction(existing.id, details)
        : await createCaseAction({ clientId, ...details });
      if (!res.ok) return setError({ field: res.field, message: res.error });
      setError(null);
      setOpen(false);
      if (existing) {
        toast.success("Case updated");
        router.refresh();
      } else {
        toast.success(`Case ${res.case.reference} opened`);
        router.push(`/cases/${res.case.id}`);
      }
    });
  };

  const fieldError = (f: string) =>
    error?.field === f ? (
      <p className="text-destructive text-sm" role="alert">
        {error.message}
      </p>
    ) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{existing ? `Edit ${existing.reference}` : "New case"}</DialogTitle>
            <DialogDescription>
              {existing
                ? `For ${existing.client.name}.`
                : "A case tracks one loan for a client through the pipeline. Its reference is assigned automatically."}
            </DialogDescription>
          </DialogHeader>
          {error && !error.field ? (
            <p className="text-destructive text-sm" role="alert">
              {error.message}
            </p>
          ) : null}

          {existing ? null : (
            <div className="grid min-w-0 grid-cols-1 gap-2">
              <Label htmlFor="case-client">Client</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger id="case-client" className="h-11 w-full">
                  <SelectValue placeholder="Choose a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldError("clientId")}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid min-w-0 grid-cols-1 gap-2">
              <Label htmlFor="case-type">Loan type</Label>
              <Select value={type} onValueChange={(v) => setType(v as CaseTypeValue)}>
                <SelectTrigger id="case-type" className="h-11 w-full">
                  <SelectValue placeholder="Choose a type" />
                </SelectTrigger>
                <SelectContent>
                  {CASE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldError("type")}
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-2">
              <Label htmlFor="case-stage">Stage</Label>
              <Select value={stage} onValueChange={(v) => setStage(v as CaseStageValue)}>
                <SelectTrigger id="case-stage" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CASE_STAGES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid min-w-0 grid-cols-1 gap-2">
              <Label htmlFor="case-loan">Loan amount</Label>
              <Input
                id="case-loan"
                name="loanAmount"
                inputMode="decimal"
                placeholder="e.g. 680k"
                defaultValue={existing?.loanAmount ? formatAud(existing.loanAmount) : ""}
                aria-invalid={error?.field === "loanAmount" || undefined}
                className="h-11 text-base md:text-sm"
              />
              {fieldError("loanAmount")}
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-2">
              <Label htmlFor="case-property">Property value</Label>
              <Input
                id="case-property"
                name="propertyValue"
                inputMode="decimal"
                placeholder="e.g. 850k"
                defaultValue={existing?.propertyValue ? formatAud(existing.propertyValue) : ""}
                aria-invalid={error?.field === "propertyValue" || undefined}
                className="h-11 text-base md:text-sm"
              />
              {fieldError("propertyValue")}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid min-w-0 grid-cols-1 gap-2">
              <Label htmlFor="case-lender">Lender</Label>
              <Input
                id="case-lender"
                name="lender"
                list="case-lenders"
                maxLength={60}
                placeholder="e.g. ANZ"
                defaultValue={existing?.lender ?? ""}
                className="h-11 text-base md:text-sm"
              />
              <datalist id="case-lenders">
                {LENDERS.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
              {fieldError("lender")}
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-2">
              <Label htmlFor="case-lender-ref">Lender reference</Label>
              <Input
                id="case-lender-ref"
                name="lenderReference"
                maxLength={40}
                placeholder="Application number"
                defaultValue={existing?.lenderReference ?? ""}
                className="h-11 text-base md:text-sm"
              />
              {fieldError("lenderReference")}
            </div>
          </div>

          {advisers.length ? (
            <div className="grid min-w-0 grid-cols-1 gap-2">
              <Label htmlFor="case-adviser">Assigned adviser</Label>
              <Select value={adviserId} onValueChange={setAdviserId}>
                <SelectTrigger id="case-adviser" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not assigned</SelectItem>
                  {advisers.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldError("assignedAdviserId")}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {existing ? "Save changes" : "Open case"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
