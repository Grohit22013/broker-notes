import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center",
        className,
      )}
    >
      <span className="bg-accent text-primary mb-4 grid size-12 place-items-center rounded-full">
        <Icon className="size-6" aria-hidden />
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
      {description ? (
        <p className="text-muted-foreground mt-1 max-w-sm text-sm">{description}</p>
      ) : null}
      {action ? (
        <div className="mt-6 max-w-full [&_a]:max-w-full [&_a]:truncate">{action}</div>
      ) : null}
    </div>
  );
}
