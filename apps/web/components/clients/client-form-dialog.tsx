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
import { createClientAction, updateClientAction, type ClientDto } from "@/lib/api/actions";
import type { UserRefDto } from "@broker-notes/shared/dto";

const NO_ADVISER = "__none__";

type Props = {
  trigger: React.ReactNode;
  /** When given, the dialog edits this client; otherwise it creates a new one. */
  client?: ClientDto;
  /** Active members who can be assigned as the client's adviser. */
  advisers?: UserRefDto[];
};

export function ClientFormDialog({ trigger, client, advisers = [] }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [adviserId, setAdviserId] = useState(client?.assignedAdviser?.id ?? NO_ADVISER);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input = {
      name: String(fd.get("name") ?? ""),
      email: String(fd.get("email") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      assignedAdviserId: adviserId === NO_ADVISER ? null : adviserId,
    };
    startTransition(async () => {
      const res = client
        ? await updateClientAction(client.id, input)
        : await createClientAction(input);
      if (!res.ok) return setError({ field: res.field, message: res.error });
      setError(null);
      setOpen(false);
      toast.success(client ? "Client updated" : `Client “${res.client.name}” added`);
      if (client) router.refresh();
      else router.push(`/clients/${res.client.id}`);
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
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{client ? "Edit client" : "New client"}</DialogTitle>
            <DialogDescription>Email is optional and used to spot duplicates.</DialogDescription>
          </DialogHeader>
          {error && !error.field ? (
            <p className="text-destructive text-sm" role="alert">
              {error.message}
            </p>
          ) : null}
          <div className="grid min-w-0 grid-cols-1 gap-2">
            <Label htmlFor="client-name">Name</Label>
            <Input
              id="client-name"
              name="name"
              required
              autoFocus
              defaultValue={client?.name}
              placeholder="e.g. Nguyen family"
              aria-invalid={error?.field === "name" || undefined}
              className="h-11 text-base md:text-sm"
            />
            {fieldError("name")}
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-2">
            <Label htmlFor="client-email">Email</Label>
            <Input
              id="client-email"
              name="email"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              defaultValue={client?.email ?? ""}
              aria-invalid={error?.field === "email" || undefined}
              className="h-11 text-base md:text-sm"
            />
            {fieldError("email")}
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-2">
            <Label htmlFor="client-phone">Phone</Label>
            <Input
              id="client-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              defaultValue={client?.phone ?? ""}
              placeholder="0400 000 000"
              aria-invalid={error?.field === "phone" || undefined}
              className="h-11 text-base md:text-sm"
            />
            {fieldError("phone")}
          </div>
          {advisers.length ? (
            <div className="grid min-w-0 grid-cols-1 gap-2">
              <Label htmlFor="client-adviser">Assigned adviser</Label>
              <Select value={adviserId} onValueChange={setAdviserId}>
                <SelectTrigger id="client-adviser" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ADVISER}>Not assigned</SelectItem>
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
              {client ? "Save changes" : "Add client"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
