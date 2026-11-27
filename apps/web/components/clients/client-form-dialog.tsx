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
import { createClientAction, updateClientAction, type ClientDto } from "@/lib/api/actions";

type Props = {
  trigger: React.ReactNode;
  /** When given, the dialog edits this client; otherwise it creates a new one. */
  client?: ClientDto;
};

export function ClientFormDialog({ trigger, client }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input = {
      name: String(fd.get("name") ?? ""),
      email: String(fd.get("email") ?? ""),
      phone: String(fd.get("phone") ?? ""),
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
          <div className="grid gap-2">
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
          <div className="grid gap-2">
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
          <div className="grid gap-2">
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
