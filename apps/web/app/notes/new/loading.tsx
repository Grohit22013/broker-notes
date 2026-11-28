import { Skeleton } from "@/components/ui/skeleton";

export default function NewNoteLoading() {
  return (
    <div className="container-page" aria-busy="true" aria-label="Loading templates">
      <div className="space-y-2 py-6 md:py-8">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 7 }, (_, i) => (
          <li key={i} className="flex gap-3 rounded-xl border p-5">
            <Skeleton className="size-10 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-full" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
