"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

export function SubmitButton({
  pending,
  children,
  pendingText,
}: {
  pending: boolean;
  children: React.ReactNode;
  pendingText: string;
}) {
  return (
    <Button type="submit" className="h-11 w-full text-base md:text-sm" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {pendingText}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
