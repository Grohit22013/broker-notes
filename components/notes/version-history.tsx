"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { History, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { buildExtensions } from "@/components/editor/extensions";
import type { NoteEditorApi } from "@/components/editor/note-editor";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { formatDateTime, formatRelative } from "@/lib/format";
import { displayTitle, type DocJson } from "@/lib/notes/content";
import { cn } from "@/lib/utils";
import {
  getVersionAction,
  listVersionsAction,
  snapshotNoteAction,
  type VersionDto,
} from "@/server/note-actions";

/** Snapshot list + read-only preview; restoring is only offered while the note is a draft. */
export function VersionHistory({
  noteId,
  canRestore,
  editorApi,
}: {
  noteId: string;
  canRestore: boolean;
  editorApi: NoteEditorApi | null;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<VersionDto[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ title: string; contentJson: DocJson } | null>(null);
  const [loading, startLoading] = useTransition();
  const [restoring, startRestoring] = useTransition();

  // Load the list each time the panel opens (it changes as the broker edits).
  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setPreview(null);
    startLoading(async () => setVersions(await listVersionsAction(noteId)));
  }, [open, noteId]);

  const select = (id: string) => {
    setSelected(id);
    startLoading(async () => {
      const res = await getVersionAction(noteId, id);
      if (!res.ok) return void toast.error(res.error);
      setPreview({ title: res.title, contentJson: res.contentJson });
    });
  };

  const restore = () =>
    startRestoring(async () => {
      if (!preview || !editorApi) return;
      // Keep the current state in history first, so restoring is itself reversible.
      await snapshotNoteAction(noteId);
      editorApi.restore(preview.title, preview.contentJson);
      toast.success("Version restored");
      setOpen(false);
    });

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-10"
        aria-label="History"
        onClick={() => setOpen(true)}
      >
        <History className="size-4" aria-hidden />
        <span className="hidden sm:inline">History</span>
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={isDesktop ? "right" : "bottom"}
          className={cn(
            "gap-0",
            isDesktop ? "w-full sm:max-w-xl" : "pb-safe max-h-[90dvh] rounded-t-2xl",
          )}
        >
          <SheetHeader>
            <SheetTitle>Version history</SheetTitle>
            <SheetDescription>
              Snapshots are saved as you work (at most every 5 minutes) and when a note is
              finalised.
            </SheetDescription>
          </SheetHeader>

          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-4 pb-6">
            {versions === null ? (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
              </div>
            ) : versions.length === 0 ? (
              <p className="text-muted-foreground text-sm">No versions yet.</p>
            ) : (
              <ol className="grid gap-1" aria-label="Versions, newest first">
                {versions.map((v, i) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => select(v.id)}
                      aria-current={selected === v.id}
                      className={cn(
                        "hover:bg-accent w-full rounded-md px-3 py-2 text-left text-sm",
                        selected === v.id && "bg-accent",
                      )}
                    >
                      <span className="font-medium">{displayTitle(v.title)}</span>
                      <span className="text-muted-foreground block text-xs">
                        {formatDateTime(new Date(v.createdAt))} ·{" "}
                        {formatRelative(new Date(v.createdAt))}
                        {i === 0 ? " · latest" : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}

            {selected ? (
              <div className="rounded-lg border">
                <div className="bg-muted/50 flex items-center justify-between gap-2 border-b px-3 py-2">
                  <span className="text-sm font-medium">Preview</span>
                  {canRestore ? (
                    <Button
                      size="sm"
                      onClick={restore}
                      disabled={!preview || restoring || loading || !editorApi}
                    >
                      {restoring ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : (
                        <RotateCcw className="size-4" aria-hidden />
                      )}
                      Restore this version
                    </Button>
                  ) : (
                    <span className="text-muted-foreground text-xs">
                      Finalised notes can&apos;t be restored
                    </span>
                  )}
                </div>
                <div className="max-h-[45vh] overflow-y-auto p-4">
                  {preview && !loading ? (
                    <VersionPreview {...preview} />
                  ) : (
                    <Loader2 className="text-muted-foreground size-4 animate-spin" />
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function VersionPreview({ title, contentJson }: { title: string; contentJson: DocJson }) {
  const extensions = useMemo(() => buildExtensions({ placeholder: "" }), []);
  const editor = useEditor(
    {
      extensions,
      content: contentJson,
      editable: false,
      immediatelyRender: false,
      editorProps: {
        attributes: { class: "tiptap-content text-sm", "aria-label": "Version preview" },
      },
    },
    [contentJson],
  );
  return (
    <div>
      <p className="mb-3 text-lg font-semibold">{displayTitle(title)}</p>
      <EditorContent editor={editor} />
    </div>
  );
}
