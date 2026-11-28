"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";

import { ConflictBanner, DraftBanner } from "@/components/editor/recovery-banners";
import { EditorToolbar } from "@/components/editor/toolbar";
import { SaveStatusIndicator } from "@/components/editor/save-status";
import { useAutosave } from "@/hooks/use-autosave";
import { toPlainDoc, type DocJson } from "@broker-notes/shared/notes/content";
import {
  draftOffer,
  draftStorageKey,
  parseLocalDraft,
  type LocalDraft,
} from "@broker-notes/shared/notes/drafts";
import type { NoteConflictDto } from "@broker-notes/shared/dto";
import { TITLE_MAX } from "@broker-notes/shared/notes/limits";
import { saveNoteAction } from "@/lib/api/actions";

import { buildExtensions } from "./extensions";

type NoteEditorProps = {
  noteId: string;
  initialTitle: string;
  initialContent: DocJson;
  /** The note's revision when loaded; saves are refused if it has moved on (edit conflict). */
  initialRevision: number;
  /** Rendered between the title and the body (e.g. note details badges). */
  belowTitle?: React.ReactNode;
  /** Rendered above the title (e.g. the "finalised" banner). */
  aboveTitle?: React.ReactNode;
  /** Rendered after the body (e.g. amendments). */
  afterBody?: React.ReactNode;
  /** Finalised notes: no toolbar, no autosave, nothing editable. */
  readOnly?: boolean;
  /** Receives an API other components (e.g. version history) can use to drive the editor. */
  onReady?: (api: NoteEditorApi) => void;
};

export type NoteEditorApi = {
  /** Replaces title + body (e.g. restoring a version) and saves immediately. */
  restore: (title: string, content: DocJson) => void;
  /** True when there are no unsaved changes. */
  isSaved: () => boolean;
  /** Starts saving any pending changes now (requests run in order, so a following one sees them). */
  flush: () => Promise<void>;
  /** Appends a heading + checklist (e.g. AI action items) to the end of the note. */
  insertChecklist: (heading: string, items: string[]) => void;
  /** Appends a heading + paragraph (e.g. an AI summary) to the end of the note. */
  insertSection: (heading: string, text: string) => void;
  /** The current document (e.g. to turn its unticked checklist into tasks). */
  getDoc: () => DocJson;
};

type Draft = { title: string; contentJson: DocJson; contentText: string };

export function NoteEditor({
  noteId,
  initialTitle,
  initialContent,
  initialRevision,
  belowTitle,
  aboveTitle,
  afterBody,
  readOnly = false,
  onReady,
}: NoteEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  // The revision our edits are based on; every successful save moves it forward.
  const revision = useRef(initialRevision);
  const save = useCallback(
    async (draft: Draft) => {
      const res = await saveNoteAction({ id: noteId, ...draft, baseRevision: revision.current });
      if (res.ok) revision.current = res.revision;
      return res;
    },
    [noteId],
  );
  const { status, error, schedule, flush, conflict, resolveConflict } = useAutosave<
    Draft,
    NoteConflictDto
  >({ save, delay: 1500 });

  // ── Local draft: unsaved edits are mirrored to this browser until the server has them ──
  const storageKey = draftStorageKey(noteId);
  const writeLocalDraft = useCallback(
    (d: Draft) => {
      try {
        const local: LocalDraft = {
          title: d.title,
          contentJson: d.contentJson,
          baseRevision: revision.current,
          savedAt: new Date().toISOString(),
        };
        localStorage.setItem(storageKey, JSON.stringify(local));
      } catch {
        // Storage full or disabled: autosave still works, there's just no local copy.
      }
    },
    [storageKey],
  );
  const clearLocalDraft = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }, [storageKey]);
  useEffect(() => {
    if (status === "saved") clearLocalDraft();
  }, [status, clearLocalDraft]);

  // On open: offer edits left behind by a crashed/closed tab (only if they differ).
  const [recovered, setRecovered] = useState<(LocalDraft & { stale: boolean }) | null>(null);
  useEffect(() => {
    if (readOnly) return;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(storageKey);
    } catch {
      return;
    }
    const local = parseLocalDraft(raw);
    const offer = draftOffer(local, {
      title: initialTitle,
      contentJson: initialContent,
      revision: initialRevision,
    });
    if (local && offer.offer) setRecovered({ ...local, stale: offer.stale });
    else if (local) clearLocalDraft();
    // Only when the note is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  const extensions = useMemo(
    () =>
      buildExtensions({
        placeholder: "Start your file note… Type / for headings, checklists and tables",
      }),
    [],
  );

  const editor = useEditor({
    extensions,
    content: initialContent,
    editable: !readOnly,
    immediatelyRender: false, // required for SSR with Next.js
    editorProps: {
      attributes: {
        class: "tiptap-content focus:outline-none",
        "aria-label": "Note body",
        "aria-multiline": "true",
        role: "textbox",
      },
    },
  });

  // Build the draft from the current editor + title and queue a save.
  const queueSave = useCallback(
    (nextTitle: string) => {
      if (!editor) return;
      const draft = {
        title: nextTitle,
        contentJson: toPlainDoc(editor.getJSON()),
        contentText: editor.getText({ blockSeparator: "\n" }),
      };
      writeLocalDraft(draft);
      schedule(draft);
    },
    [editor, schedule, writeLocalDraft],
  );

  // Latest title for the editor's update handler without re-subscribing on every keystroke.
  const titleValue = useRef(title);
  useEffect(() => {
    titleValue.current = title;
  }, [title]);

  useEffect(() => {
    if (!editor || readOnly) return;
    const onUpdate = () => queueSave(titleValue.current);
    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
    };
  }, [editor, queueSave, readOnly]);

  // Expose a small API (used by version history to restore a snapshot).
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    if (!editor || !onReady) return;
    onReady({
      restore: (nextTitle, content) => {
        editor.commands.setContent(content, { emitUpdate: false });
        setTitle(nextTitle);
        titleValue.current = nextTitle;
        queueSave(nextTitle);
        void flush();
      },
      isSaved: () => statusRef.current === "saved" || statusRef.current === "idle",
      flush,
      getDoc: () => toPlainDoc(editor.getJSON()),
      insertChecklist: (heading, items) => {
        editor
          .chain()
          .focus("end")
          .insertContent([
            { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: heading }] },
            {
              type: "taskList",
              content: items.map((text) => ({
                type: "taskItem",
                attrs: { checked: false },
                content: [{ type: "paragraph", content: [{ type: "text", text }] }],
              })),
            },
          ])
          .run();
      },
      insertSection: (heading, text) => {
        editor
          .chain()
          .focus("end")
          .insertContent([
            { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: heading }] },
            { type: "paragraph", content: [{ type: "text", text }] },
          ])
          .run();
      },
    });
  }, [editor, onReady, queueSave, flush]);

  // Lock/unlock when the note is finalised without remounting the editor.
  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  // Ctrl/Cmd+S saves immediately (habit from desktop apps).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void flush();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [flush]);

  // Auto-grow the title textarea.
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);

  /** Replace the editor's title + body without treating it as a user edit. */
  const replaceContent = useCallback(
    (nextTitle: string, content: DocJson) => {
      editor?.commands.setContent(content, { emitUpdate: false });
      setTitle(nextTitle);
      titleValue.current = nextTitle;
    },
    [editor],
  );

  const loadTheirs = () => {
    if (!conflict) return;
    revision.current = conflict.revision;
    replaceContent(conflict.title, conflict.contentJson);
    clearLocalDraft();
    resolveConflict("discard");
  };
  const keepMine = () => {
    if (!conflict) return;
    // Save my version on top of theirs (their version stays in the history).
    revision.current = conflict.revision;
    resolveConflict("keep");
  };
  const restoreDraft = () => {
    if (!recovered) return;
    replaceContent(recovered.title, recovered.contentJson);
    setRecovered(null);
    queueSave(recovered.title);
  };
  const discardDraft = () => {
    clearLocalDraft();
    setRecovered(null);
  };

  const words = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? (e.storage.characterCount?.words() as number) : 0),
  });

  return (
    <div className="flex flex-col">
      {/* Sticky toolbar + save status, sits just under the app header. */}
      <div
        hidden={readOnly}
        className="bg-background/95 sticky top-[calc(3.5rem+env(safe-area-inset-top,0px))] z-30 -mx-4 border-b backdrop-blur sm:-mx-6 lg:-mx-8"
      >
        <div className="container-page flex items-center gap-2 px-0 sm:px-2 lg:px-4">
          <div className="relative min-w-0 flex-1">
            {editor ? <EditorToolbar editor={editor} /> : <div className="h-[52px] md:h-11" />}
            {/* Fade on the right edge hints that the toolbar scrolls sideways on phones. */}
            <div
              aria-hidden
              className="from-background pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l to-transparent md:hidden"
            />
          </div>
          <div className="hidden pr-2 sm:block">
            <SaveStatusIndicator status={status} error={error} onRetry={() => void flush()} />
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl py-6 md:py-10">
        {readOnly ? null : (
          <div className="mb-2 sm:hidden">
            <SaveStatusIndicator status={status} error={error} onRetry={() => void flush()} />
          </div>
        )}

        {aboveTitle}

        {!readOnly && conflict ? (
          <ConflictBanner
            updatedAt={conflict.updatedAt}
            onLoadTheirs={loadTheirs}
            onKeepMine={keepMine}
          />
        ) : null}
        {!readOnly && recovered && !conflict ? (
          <DraftBanner
            savedAt={recovered.savedAt}
            stale={recovered.stale}
            onRestore={restoreDraft}
            onDiscard={discardDraft}
          />
        ) : null}

        <label htmlFor="note-title" className="sr-only">
          Note title
        </label>
        <textarea
          id="note-title"
          ref={titleRef}
          rows={1}
          maxLength={TITLE_MAX}
          value={title}
          readOnly={readOnly}
          placeholder="Untitled note"
          onChange={(e) => {
            const next = e.target.value.replace(/\n/g, " ");
            setTitle(next);
            queueSave(next);
          }}
          onKeyDown={(e) => {
            // Enter in the title jumps into the body, like most note apps.
            if (e.key === "Enter") {
              e.preventDefault();
              editor?.commands.focus("start");
            }
          }}
          className="placeholder:text-muted-foreground/60 w-full resize-none overflow-hidden bg-transparent text-2xl leading-tight font-semibold tracking-tight outline-none md:text-3xl"
        />

        {belowTitle}

        <div
          className={readOnly ? "mt-4" : "mt-4 min-h-[50vh]"}
          onClick={() => !readOnly && editor?.commands.focus()}
        >
          <EditorContent editor={editor} />
        </div>

        {afterBody}

        <p className="text-muted-foreground mt-8 text-xs">
          {words ?? 0} {words === 1 ? "word" : "words"}
          {readOnly ? " · Finalised (read-only)" : " · Changes save automatically"}
        </p>
      </div>
    </div>
  );
}
