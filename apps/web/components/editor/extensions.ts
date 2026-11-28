import type { Extensions } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder, CharacterCount } from "@tiptap/extensions";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Highlight } from "@tiptap/extension-highlight";
import { TableKit } from "@tiptap/extension-table";

import { SlashCommand } from "./slash-command";

/**
 * Editor feature set for broker file notes:
 * headings for structure, lists + checklists for conditions / document requests,
 * highlight for key figures, tables for lender comparisons, safe links, and a "/" command menu.
 */
export function buildExtensions({ placeholder }: { placeholder: string }): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        protocols: ["http", "https", "mailto", "tel"],
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      },
    }),
    Placeholder.configure({
      placeholder: ({ node }) => (node.type.name === "heading" ? "Heading" : placeholder),
      showOnlyWhenEditable: true,
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Highlight.configure({ multicolor: false }),
    TableKit.configure({ table: { resizable: false } }),
    CharacterCount,
    SlashCommand,
  ];
}
