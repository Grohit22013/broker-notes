import {
  Briefcase,
  FileText,
  LayoutDashboard,
  ListTodo,
  Plus,
  Users,
  type LucideIcon,
} from "lucide-react";

export const siteConfig = {
  name: "BrokerNotes",
  description:
    "AI-assisted, compliance-grade file notes for Australian mortgage brokers. Capture client conversations, track loan stages and keep a Best Interests Duty audit trail.",
} as const;

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const mainNav: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/notes", label: "Notes", icon: FileText },
  { href: "/notes/new", label: "New", icon: Plus },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/cases", label: "Cases", icon: Briefcase },
  { href: "/clients", label: "Clients", icon: Users },
];

/** Returns true when `pathname` belongs to the section `href` (exact match for /notes/new). */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/notes/new") return pathname === href;
  if (href === "/notes") return pathname === "/notes" || /^\/notes\/(?!new$)[^/]+/.test(pathname);
  return pathname === href || pathname.startsWith(`${href}/`);
}
