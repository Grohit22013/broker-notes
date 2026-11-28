"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Extension, type Editor, type Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";

import { cn } from "@/lib/utils";
import { filterSlashItems, type SlashItem, type SlashItemId } from "@/lib/editor/slash-items";

/** Runs the chosen command after removing the "/query" text. */
function run(editor: Editor, range: Range, id: SlashItemId) {
  const chain = editor.chain().focus().deleteRange(range);
  switch (id) {
    case "h1":
      return chain.setNode("heading", { level: 1 }).run();
    case "h2":
      return chain.setNode("heading", { level: 2 }).run();
    case "h3":
      return chain.setNode("heading", { level: 3 }).run();
    case "bullets":
      return chain.toggleBulletList().run();
    case "numbers":
      return chain.toggleOrderedList().run();
    case "checklist":
      return chain.toggleTaskList().run();
    case "table":
      return chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    case "quote":
      return chain.toggleBlockquote().run();
    case "divider":
      return chain.setHorizontalRule().run();
  }
}

type MenuHandle = { onKeyDown: (props: SuggestionKeyDownProps) => boolean };
type MenuProps = { items: SlashItem[]; command: (item: SlashItem) => void };

/** The floating list. Arrow keys move, Enter picks, Escape closes (handled by Suggestion). */
const SlashMenu = forwardRef<MenuHandle, MenuProps>(function SlashMenu({ items, command }, ref) {
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (!items.length) return false;
      if (event.key === "ArrowDown") {
        setActive((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        setActive((i) => (i - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        command(items[active]!);
        return true;
      }
      return false;
    },
  }));

  if (!items.length) {
    return (
      <div className="bg-popover text-muted-foreground rounded-lg border p-3 text-sm shadow-md">
        No matching blocks
      </div>
    );
  }
  return (
    <div
      role="listbox"
      aria-label="Insert block"
      className="bg-popover text-popover-foreground max-h-72 w-64 overflow-y-auto rounded-lg border p-1 shadow-md"
    >
      {items.map((item, i) => (
        <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={i === active}
          onMouseEnter={() => setActive(i)}
          onMouseDown={(e) => {
            e.preventDefault(); // keep the editor focused
            command(item);
          }}
          className={cn(
            "flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left",
            i === active && "bg-accent text-accent-foreground",
          )}
        >
          <span className="text-sm font-medium">{item.title}</span>
          <span className="text-muted-foreground text-xs">{item.description}</span>
        </button>
      ))}
    </div>
  );
});

/** Positions the menu under the "/" (flips above it near the bottom of the screen). */
function place(el: HTMLElement, rect: DOMRect | null | undefined) {
  if (!rect) return;
  const below = window.innerHeight - rect.bottom > 300;
  el.style.position = "fixed";
  el.style.zIndex = "60";
  el.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 272))}px`;
  el.style.top = below ? `${rect.bottom + 6}px` : "";
  el.style.bottom = below ? "" : `${window.innerHeight - rect.top + 6}px`;
}

/** Type "/" at the start of a line (or after a space) to insert headings, lists, tables… */
export const SlashCommand = Extension.create({
  name: "slashCommand",

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        char: "/",
        startOfLine: false,
        allowSpaces: false,
        items: ({ query }) => filterSlashItems(query),
        command: ({ editor, range, props }) => run(editor, range, props.id),
        render: () => {
          let renderer: ReactRenderer<MenuHandle, MenuProps> | null = null;
          return {
            onStart: (props: SuggestionProps<SlashItem>) => {
              renderer = new ReactRenderer(SlashMenu, {
                props: { items: props.items, command: props.command },
                editor: props.editor,
              });
              document.body.appendChild(renderer.element);
              place(renderer.element as HTMLElement, props.clientRect?.());
            },
            onUpdate: (props: SuggestionProps<SlashItem>) => {
              renderer?.updateProps({ items: props.items, command: props.command });
              if (renderer) place(renderer.element as HTMLElement, props.clientRect?.());
            },
            onKeyDown: (props: SuggestionKeyDownProps) => {
              if (props.event.key === "Escape") {
                renderer?.destroy();
                renderer?.element.remove();
                renderer = null;
                return true;
              }
              return renderer?.ref?.onKeyDown(props) ?? false;
            },
            onExit: () => {
              renderer?.element.remove();
              renderer?.destroy();
              renderer = null;
            },
          };
        },
      }),
    ];
  },
});
