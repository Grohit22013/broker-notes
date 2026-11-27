"use client";

import { useState } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import {
  Bold,
  Columns3,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  MoreHorizontal,
  Quote,
  Redo2,
  Rows3,
  Strikethrough,
  Table,
  Trash2,
  Underline,
  Undo2,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ToolButtonProps = {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

function ToolButton({ icon: Icon, label, shortcut, active, disabled, onClick }: ToolButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          // 44px tap targets on touch screens, compact on desktop.
          className={cn(
            "size-11 shrink-0 md:size-9",
            active && "bg-accent text-primary hover:bg-accent",
          )}
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          // Keep focus (and the selection) in the editor when clicking toolbar buttons.
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClick}
        >
          <Icon className="size-4" aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label}
        {shortcut ? <span className="text-muted-foreground ml-2">{shortcut}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

const Divider = () => <Separator orientation="vertical" className="mx-1 h-6 shrink-0" />;

export function EditorToolbar({ editor }: { editor: Editor }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  // Subscribe only to the bits of state the toolbar renders (avoids re-rendering on every keystroke).
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      highlight: e.isActive("highlight"),
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      table: e.isActive("table"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const chain = () => editor.chain().focus();

  const openLinkDialog = () => {
    setLinkUrl((editor.getAttributes("link").href as string | undefined) ?? "");
    setLinkOpen(true);
  };

  const applyLink = (e: React.FormEvent) => {
    e.preventDefault();
    const url = linkUrl.trim();
    if (!url) chain().extendMarkRange("link").unsetLink().run();
    else chain().extendMarkRange("link").setLink({ href: url }).run();
    setLinkOpen(false);
  };

  return (
    <>
      <div
        role="toolbar"
        aria-label="Formatting"
        // Horizontal scroll on narrow screens instead of wrapping into several rows.
        className="flex [scrollbar-width:none] items-center gap-0.5 overflow-x-auto px-1 py-1 [&::-webkit-scrollbar]:hidden"
      >
        <ToolButton
          icon={Undo2}
          label="Undo"
          shortcut="Ctrl+Z"
          disabled={!s.canUndo}
          onClick={() => chain().undo().run()}
        />
        <ToolButton
          icon={Redo2}
          label="Redo"
          shortcut="Ctrl+Shift+Z"
          disabled={!s.canRedo}
          onClick={() => chain().redo().run()}
        />
        <Divider />
        <ToolButton
          icon={Heading1}
          label="Heading 1"
          active={s.h1}
          onClick={() => chain().toggleHeading({ level: 1 }).run()}
        />
        <ToolButton
          icon={Heading2}
          label="Heading 2"
          active={s.h2}
          onClick={() => chain().toggleHeading({ level: 2 }).run()}
        />
        <ToolButton
          icon={Heading3}
          label="Heading 3"
          active={s.h3}
          onClick={() => chain().toggleHeading({ level: 3 }).run()}
        />
        <Divider />
        <ToolButton
          icon={Bold}
          label="Bold"
          shortcut="Ctrl+B"
          active={s.bold}
          onClick={() => chain().toggleBold().run()}
        />
        <ToolButton
          icon={Italic}
          label="Italic"
          shortcut="Ctrl+I"
          active={s.italic}
          onClick={() => chain().toggleItalic().run()}
        />
        <ToolButton
          icon={Underline}
          label="Underline"
          shortcut="Ctrl+U"
          active={s.underline}
          onClick={() => chain().toggleUnderline().run()}
        />
        <ToolButton
          icon={Highlighter}
          label="Highlight"
          shortcut="Ctrl+Shift+H"
          active={s.highlight}
          onClick={() => chain().toggleHighlight().run()}
        />
        <Divider />
        <ToolButton
          icon={List}
          label="Bullet list"
          active={s.bullet}
          onClick={() => chain().toggleBulletList().run()}
        />
        <ToolButton
          icon={ListOrdered}
          label="Numbered list"
          active={s.ordered}
          onClick={() => chain().toggleOrderedList().run()}
        />
        <ToolButton
          icon={ListChecks}
          label="Checklist"
          active={s.task}
          onClick={() => chain().toggleTaskList().run()}
        />
        <Divider />
        <ToolButton icon={Link2} label="Link" active={s.link} onClick={openLinkDialog} />
        <ToolButton
          icon={Table}
          label="Insert table"
          active={s.table}
          onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="size-11 shrink-0 md:size-9"
              aria-label="More formatting"
              onMouseDown={(e) => e.preventDefault()}
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={() => chain().toggleStrike().run()}>
              <Strikethrough className="size-4" /> Strikethrough
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => chain().toggleBlockquote().run()}>
              <Quote className="size-4" /> {s.quote ? "Remove quote" : "Quote"}
            </DropdownMenuItem>
            {s.table ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Table</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => chain().addRowAfter().run()}>
                  <Rows3 className="size-4" /> Add row below
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => chain().addColumnAfter().run()}>
                  <Columns3 className="size-4" /> Add column right
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => chain().deleteRow().run()}>
                  <Rows3 className="size-4" /> Delete row
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => chain().deleteColumn().run()}>
                  <Columns3 className="size-4" /> Delete column
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => chain().deleteTable().run()}
                >
                  <Trash2 className="size-4" /> Delete table
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={applyLink} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{s.link ? "Edit link" : "Add link"}</DialogTitle>
              <DialogDescription>Leave empty to remove the link.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="link-url">URL</Label>
              <Input
                id="link-url"
                type="url"
                inputMode="url"
                placeholder="https://lender.com.au/rates"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className="h-11 text-base md:text-sm"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setLinkOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Save link</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
