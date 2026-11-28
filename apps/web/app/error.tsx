"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CloudOff, RotateCcw } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

/**
 * Friendly fallback when a page fails to load — most often the API being briefly unreachable
 * (e.g. a free host waking up). Offers a retry instead of a blank screen.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container-page py-12">
      <EmptyState
        icon={CloudOff}
        title="We couldn't load this page"
        description="The server may be waking up or briefly unavailable. Your notes are safe — please try again in a few seconds."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={reset}>
              <RotateCcw className="size-4" aria-hidden /> Try again
            </Button>
            <Button asChild variant="outline">
              <Link href="/notes">Back to notes</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
