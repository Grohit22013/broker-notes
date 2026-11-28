"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { setFavouriteAction } from "@/lib/api/note-extras-actions";
import { cn } from "@/lib/utils";

/** Star toggle for a note. Favourites are personal to the signed-in member. */
export function FavouriteButton({
  noteId,
  initial,
  noteTitle,
  className,
}: {
  noteId: string;
  initial: boolean;
  /** Names the note in the label (lists); omit where the note is obvious (its own page). */
  noteTitle?: string;
  className?: string;
}) {
  const router = useRouter();
  const [favourite, setFavourite] = useState(initial);

  const toggle = async () => {
    const next = !favourite;
    setFavourite(next); // optimistic
    const res = await setFavouriteAction(noteId, next);
    if (!res.ok) {
      setFavourite(!next);
      toast.error(res.error);
      return;
    }
    router.refresh();
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("size-10", className)}
      aria-pressed={favourite}
      aria-label={
        noteTitle
          ? favourite
            ? `Remove ${noteTitle} from favourites`
            : `Add ${noteTitle} to favourites`
          : favourite
            ? "Remove from favourites"
            : "Add to favourites"
      }
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void toggle();
      }}
    >
      <Star
        className={cn("size-4", favourite ? "fill-amber-400 text-amber-500" : "")}
        aria-hidden
      />
    </Button>
  );
}
