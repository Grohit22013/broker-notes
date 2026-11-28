import { Skeleton } from "@/components/ui/skeleton";

export default function NoteLoading() {
  return (
    <div className="container-page" aria-busy="true" aria-label="Loading note">
      <div className="flex items-center justify-between pt-3">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="size-10 rounded-md" />
      </div>
      <Skeleton className="mt-3 h-12 w-full" />
      <div className="mx-auto max-w-3xl space-y-4 py-10">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  );
}
