import Link from "next/link";
import { SearchX } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container-page py-12">
      <EmptyState
        icon={SearchX}
        title="Page not found"
        description="That page doesn't exist, or you don't have access to it."
        action={
          <Button asChild>
            <Link href="/notes">Back to notes</Link>
          </Button>
        }
      />
    </div>
  );
}
