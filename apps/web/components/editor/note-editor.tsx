"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";

import { EditorToolbar } from "@/components/editor/toolbar";
import { SaveStatusIndicator } from "@/components/editor/save-status";
import { useAutosave } from "@/hooks/use-autosave";
import { toPlainDoc, type DocJson } from "@broker-notes/shared/notes/content";
import { TITLE_MAX } from "@broker-notes/shared/notes/limits";
import { saveNoteAction } from "@/lib/api/actions";

import { buildExtensions } from "./extensions";

type NoteEditorProps = {
  noteId: string;
  initialTitle: string;
  initialContent: DocJson;
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
};

type Draft = { title: string; contentJson: DocJson; contentText: string };

export function NoteEditor({
  noteId,
  initialTitle,
  initialContent,
  belowTitle,
  aboveTitle,
  afterBody,
  readOnly = false,
  onReady,
}: NoteEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  const save = useCallback((draft: Draft) => saveNoteAction({ id: noteId, ...draft }), [noteId]);
  const { status, error, schedule, flush } = useAutosave<Draft>({ save, delay: 1500 });

  const extensions = useMemo(
    () =>
      buildExtensions({
        placeholder:
          "Start your file note… Markdown shortcuts work: ## heading, - list, [ ] checklist",
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
      schedule({
        title: nextTitle,
        contentJson: toPlainDoc(editor.getJSON()),
        contentText: editor.getText({ blockSeparator: "\n" }),
      });
    },
    [editor, schedule],
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
