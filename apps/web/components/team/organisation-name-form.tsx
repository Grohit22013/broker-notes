"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { renameOrganisationAction } from "@/lib/api/org-actions";

/** Admin-only: rename the brokerage. */
export function OrganisationNameForm({ name }: { name: string }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const changed = value.trim() !== name;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await renameOrganisationAction(value);
      if (!res.ok) return setError(res.error);
      setError(null);
      toast.success("Brokerage renamed");
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="grid max-w-lg gap-2" noValidate>
      <Label htmlFor="org-name">Brokerage name</Label>
      <div className="flex gap-2">
        <Input
          id="org-name"
          value={value}
          maxLength={80}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "org-name-error" : undefined}
          className="h-11 flex-1 text-base md:text-sm"
        />
        <Button type="submit" className="h-11" disabled={pending || !changed}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Save
        </Button>
      </div>
      {error ? (
        <p id="org-name-error" role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </form>
  );
}
