"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarClock, UserRoundPen, Loader2, Search, SlidersHorizontal, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  activeFilterCount,
  filtersToSearchParams,
  hasAnyFilter,
  type NoteFilters,
} from "@broker-notes/shared/notes/filter-utils";
import {
  LOAN_STAGES,
  NOTE_TYPES,
  SORT_OPTIONS,
  type SortValue,
} from "@broker-notes/shared/notes/taxonomy";
import { cn } from "@/lib/utils";

const ALL = "all"; // Radix Select can't use "" as an item value

type Props = {
  filters: NoteFilters;
  tags: string[];
  dueCount: number;
};

export function NotesFilters({ filters, tags, dueCount }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(filters.q);
  const [sheetOpen, setSheetOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the box in sync when the URL changes elsewhere (e.g. "Clear filters", back button).
  useEffect(() => setQuery(filters.q), [filters.q]);

  const apply = (next: Partial<NoteFilters>) => {
    const params = filtersToSearchParams({ ...filters, ...next });
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  const onSearch = (value: string) => {
    setQuery(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => apply({ q: value }), 300);
  };

  const clearAll = () => {
    setQuery("");
    startTransition(() => router.replace(pathname, { scroll: false }));
  };

  const count = activeFilterCount(filters);

  const renderSelects = (idPrefix: string) => (
    <>
      <FilterSelect
        idPrefix={idPrefix}
        label="Loan stage"
        value={filters.stage ?? ALL}
        onChange={(v) => apply({ stage: v === ALL ? undefined : (v as NoteFilters["stage"]) })}
        options={[{ value: ALL, label: "All stages" }, ...LOAN_STAGES]}
      />
      <FilterSelect
        idPrefix={idPrefix}
        label="Note type"
        value={filters.type ?? ALL}
        onChange={(v) => apply({ type: v === ALL ? undefined : (v as NoteFilters["type"]) })}
        options={[{ value: ALL, label: "All types" }, ...NOTE_TYPES]}
      />
      <FilterSelect
        idPrefix={idPrefix}
        label="Tag"
        value={filters.tag ?? ALL}
        onChange={(v) => apply({ tag: v === ALL ? undefined : v })}
        options={[
          { value: ALL, label: "All tags" },
          ...tags.map((t) => ({ value: t, label: `#${t}` })),
        ]}
        disabled={tags.length === 0}
      />
      <FilterSelect
        idPrefix={idPrefix}
        label="Sort by"
        value={filters.sort}
        onChange={(v) => apply({ sort: v as SortValue })}
        options={[...SORT_OPTIONS]}
      />
    </>
  );

  const mineToggle = (
    <Button
      type="button"
      variant={filters.mine ? "default" : "outline"}
      className="h-10 shrink-0 rounded-full"
      aria-pressed={filters.mine}
      onClick={() => apply({ mine: !filters.mine })}
    >
      <UserRoundPen className="size-4" aria-hidden />
      Created by me
    </Button>
  );

  const dueToggle = (
    <Button
      type="button"
      variant={filters.due ? "default" : "outline"}
      className="h-10 shrink-0 rounded-full"
      aria-pressed={filters.due}
      onClick={() => apply({ due: !filters.due })}
    >
      <CalendarClock className="size-4" aria-hidden />
      Follow-ups due
      <span
        className={cn(
          "rounded-full px-1.5 text-xs tabular-nums",
          filters.due ? "bg-primary-foreground/20" : "bg-muted",
        )}
      >
        {dueCount}
      </span>
    </Button>
  );

  return (
    <div className="space-y-3" role="search" aria-label="Search and filter notes">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            aria-label="Search notes"
            placeholder="Search titles and notes…"
            value={query}
            onChange={(e) => onSearch(e.target.value)}
            className="h-11 pr-10 pl-9 text-base md:h-10 md:text-sm [&::-webkit-search-cancel-button]:hidden"
          />
          {pending ? (
            <Loader2
              className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin"
              aria-label="Updating results"
            />
          ) : query ? (
            <button
              type="button"
              onClick={() => onSearch("")}
              className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 grid w-10 place-items-center"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        {/* Mobile: filters live in a bottom sheet */}
        <Button
          type="button"
          variant="outline"
          className="h-11 shrink-0 md:hidden"
          onClick={() => setSheetOpen(true)}
          aria-label={`Filters${count ? ` (${count} active)` : ""}`}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          Filters
          {count ? <Badge className="h-5 min-w-5 rounded-full px-1.5">{count}</Badge> : null}
        </Button>
      </div>

      {/* Desktop: inline filter bar */}
      <div className="hidden flex-wrap items-end gap-2 md:flex">
        {renderSelects("desktop")}
        {dueToggle}
        {mineToggle}
        {hasAnyFilter(filters) ? (
          <Button type="button" variant="ghost" className="h-10" onClick={clearAll}>
            Clear filters
          </Button>
        ) : null}
      </div>

      {/* Mobile: quick toggle stays one tap away */}
      <div className="flex items-center gap-2 overflow-x-auto md:hidden">
        {dueToggle}
        {mineToggle}
        {hasAnyFilter(filters) ? (
          <Button type="button" variant="ghost" className="h-10 shrink-0" onClick={clearAll}>
            Clear
          </Button>
        ) : null}
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="pb-safe max-h-[85dvh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Filter notes</SheetTitle>
            <SheetDescription>Changes apply straight away.</SheetDescription>
          </SheetHeader>
          <div className="grid gap-4 px-4">{renderSelects("sheet")}</div>
          <SheetFooter className="flex-row gap-2">
            <Button variant="outline" className="h-11 flex-1" onClick={clearAll}>
              Clear all
            </Button>
            <Button className="h-11 flex-1" onClick={() => setSheetOpen(false)}>
              Show results
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FilterSelect({
  idPrefix,
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  idPrefix: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  disabled?: boolean;
}) {
  const id = `${idPrefix}-filter-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-muted-foreground text-xs">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className="h-11 w-full md:h-10 md:w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
