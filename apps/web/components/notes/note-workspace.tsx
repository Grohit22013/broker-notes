"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ChevronLeft, LockKeyhole } from "lucide-react";

import { NoteEditor, type NoteEditorApi } from "@/components/editor/note-editor";
import { Amendments, type AmendmentView } from "@/components/notes/amendments";
import { FinaliseButton } from "@/components/notes/finalise-button";
import { NoteActionsMenu } from "@/components/notes/note-actions-menu";
import {
  NoteDetailsButton,
  NoteDetailsSheet,
  NoteDetailsSummary,
} from "@/components/notes/note-details";
import { VersionHistory } from "@/components/notes/version-history";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import type { DocJson } from "@broker-notes/shared/notes/content";

type Props = {
  noteId: string;
  title: string;
  displayTitle: string;
  contentJson: DocJson;
  createdAt: string;
  finalisedAt: string | null;
  amendments: AmendmentView[];
};

/** Editor page body: header actions, editor, finalised banner, amendments and side panels. */
export function NoteWorkspace(props: Props) {
  const { noteId, finalisedAt } = props;
  const finalised = finalisedAt !== null;
  const [editorApi, setEditorApi] = useState<NoteEditorApi | null>(null);
  const onReady = useCallback((api: NoteEditorApi) => setEditorApi(api), []);

  return (
    <>
      <div className="container-page">
        <div className="flex items-center justify-between gap-2 pt-3">
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground -ml-2 h-10">
            <Link href="/notes">
              <ChevronLeft className="size-4" aria-hidden /> All notes
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground hidden text-xs xl:inline">
              Created {formatDateTime(new Date(props.createdAt))}
            </span>
            <NoteDetailsButton />
            <VersionHistory noteId={noteId} canRestore={!finalised} editorApi={editorApi} />
            {finalised ? null : (
              <FinaliseButton noteId={noteId} beforeFinalise={() => editorApi?.flush()} />
            )}
            <NoteActionsMenu noteId={noteId} noteTitle={props.displayTitle} />
          </div>
        </div>

        <NoteEditor
          key={finalised ? "finalised" : "draft"}
          noteId={noteId}
          initialTitle={props.title}
          initialContent={props.contentJson}
          readOnly={finalised}
          onReady={onReady}
          aboveTitle={
            finalised ? (
              <div
                role="note"
                className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200"
              >
                <LockKeyhole className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  <strong>Finalised {formatDateTime(new Date(finalisedAt))}.</strong> This file note
                  is locked as a compliance record. Add corrections as amendments below.
                </span>
              </div>
            ) : null
          }
          belowTitle={<NoteDetailsSummary />}
          afterBody={finalised ? <Amendments noteId={noteId} initial={props.amendments} /> : null}
        />
      </div>
      <NoteDetailsSheet />
    </>
  );
}
