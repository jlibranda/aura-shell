"use client";

import { useMemo, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { useOutsideClick } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export interface DatePickerProps {
  value: string | null; // ISO date (YYYY-MM-DD)
  onChange: (value: string | null) => void;
  placeholder?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function parseIso(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDisplay(value: string | null): string | null {
  const d = parseIso(value);
  if (!d) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Select a date",
  min,
  max,
  disabled = false,
  id,
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = parseIso(value);
  const [viewDate, setViewDate] = useState<Date>(selected ?? new Date());
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false), open);

  const grid = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
    return cells;
  }, [viewDate]);

  const display = formatDisplay(value);
  const todayIso = toIso(new Date());

  const isDisabled = (d: Date) => {
    const iso = toIso(d);
    if (min && iso < min) return true;
    if (max && iso > max) return true;
    return false;
  };

  const pick = (d: Date) => {
    if (isDisabled(d)) return;
    onChange(toIso(d));
    setOpen(false);
  };

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-10 w-full items-center gap-2 rounded-md border border-input bg-surface px-3 text-sm transition-colors",
          "focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25",
          "disabled:cursor-not-allowed disabled:opacity-50",
          display ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-left">{display ?? placeholder}</span>
      </button>

      {open ? (
        <div className="absolute z-40 mt-2 w-72 rounded-lg border border-border bg-surface p-3 shadow-overlay animate-scale-in">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-foreground focus-visible:outline-none"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium text-foreground">
              {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
            </span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-foreground focus-visible:outline-none"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1 text-center text-[11px] font-medium text-muted-foreground">
                {w}
              </div>
            ))}
            {grid.map((d, i) => {
              if (!d) return <div key={`empty-${i}`} />;
              const iso = toIso(d);
              const isSelected = value === iso;
              const isToday = iso === todayIso;
              const off = isDisabled(d);
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={off}
                  onClick={() => pick(d)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md text-sm tabular transition-colors focus-visible:outline-none",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-surface-muted",
                    !isSelected && isToday && "ring-1 ring-inset ring-primary/40",
                    off && "cursor-not-allowed opacity-30 hover:bg-transparent",
                  )}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <button
              type="button"
              onClick={() => {
                const t = new Date();
                setViewDate(t);
                pick(t);
              }}
              className="text-xs font-medium text-primary hover:underline"
            >
              Today
            </button>
            {value ? (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}