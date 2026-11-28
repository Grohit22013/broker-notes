"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Eye, LockKeyhole } from "lucide-react";

import { NoteEditor, type NoteEditorApi } from "@/components/editor/note-editor";
import { AiPanel } from "@/components/notes/ai-panel";
import { Amendments, type AmendmentView } from "@/components/notes/amendments";
import { FinaliseButton } from "@/components/notes/finalise-button";
import { NoteActionsMenu } from "@/components/notes/note-actions-menu";
import {
  NoteDetailsButton,
  NoteDetailsSheet,
  NoteDetailsSummary,
} from "@/components/notes/note-details";
import { VersionHistory } from "@/components/notes/version-history";
import { NoteTasks } from "@/components/tasks/note-tasks";
import type { TaskDto, UserRefDto } from "@broker-notes/shared/dto";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import type { DocJson } from "@broker-notes/shared/notes/content";

type Props = {
  noteId: string;
  title: string;
  displayTitle: string;
  contentJson: DocJson;
  createdAt: string;
  /** Author's name when someone else wrote it (null for the viewer's own note). */
  author: string | null;
  /** Author or admin. Others get a read-only view. */
  canEdit: boolean;
  /** This note's follow-up tasks (open and done). */
  tasks: TaskDto[];
  members: UserRefDto[];
  currentUserId: string;
  finalisedAt: string | null;
  amendments: AmendmentView[];
};

/** Editor page body: header actions, editor, finalised banner, amendments and side panels. */
export function NoteWorkspace(props: Props) {
  const { noteId, finalisedAt, canEdit } = props;
  const finalised = finalisedAt !== null;
  const readOnly = finalised || !canEdit;
  const [editorApi, setEditorApi] = useState<NoteEditorApi | null>(null);
  const onReady = useCallback((api: NoteEditorApi) => setEditorApi(api), []);

  return (
    <>
      <div className="container-page">
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground -ml-2 h-10">
            <Link href="/notes">
              <ChevronLeft className="size-4" aria-hidden /> All notes
            </Link>
          </Button>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            <span className="text-muted-foreground hidden text-xs xl:inline">
              Created {formatDateTime(new Date(props.createdAt))}
              {props.author ? ` by ${props.author}` : ""}
            </span>
            <NoteDetailsButton />
            <NoteTasks
              noteId={noteId}
              tasks={props.tasks}
              members={props.members}
              currentUserId={props.currentUserId}
              editorApi={editorApi}
            />
            <AiPanel noteId={noteId} editorApi={editorApi} finalised={readOnly} />
            <VersionHistory noteId={noteId} canRestore={!readOnly} editorApi={editorApi} />
            {readOnly ? null : (
              <FinaliseButton noteId={noteId} beforeFinalise={() => editorApi?.flush()} />
            )}
            {canEdit ? <NoteActionsMenu noteId={noteId} noteTitle={props.displayTitle} /> : null}
          </div>
        </div>

        <NoteEditor
          key={readOnly ? "read-only" : "draft"}
          noteId={noteId}
          initialTitle={props.title}
          initialContent={props.contentJson}
          readOnly={readOnly}
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
                  is locked as a compliance record.{" "}
                  {canEdit
                    ? "Add corrections as amendments below."
                    : "Its author or an admin can add amendments."}
                </span>
              </div>
            ) : !canEdit ? (
              <div
                role="note"
                className="bg-muted text-muted-foreground mb-4 flex items-start gap-2 rounded-lg border p-3 text-sm"
              >
                <Eye className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  <strong className="text-foreground">View only.</strong> Written by {props.author}.
                  Only the author or a brokerage admin can change this note.
                </span>
              </div>
            ) : null
          }
          belowTitle={<NoteDetailsSummary />}
          afterBody={
            finalised ? (
              <Amendments noteId={noteId} initial={props.amendments} canAdd={canEdit} />
            ) : null
          }
        />
      </div>
      <NoteDetailsSheet />
    </>
  );
}
