"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { useOutsideClick } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
}

interface BaseProps {
  options: ComboboxOption[];
  placeholder?: string;
  searchable?: boolean;
  clearable?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
  width?: string;
}

interface SingleProps extends BaseProps {
  multiple?: false;
  value: string | null;
  onChange: (value: string | null) => void;
}

interface MultiProps extends BaseProps {
  multiple: true;
  value: string[];
  onChange: (value: string[]) => void;
}

export type ComboboxProps = SingleProps | MultiProps;

export function Combobox(props: ComboboxProps) {
  const {
    options,
    placeholder = "Select…",
    searchable = true,
    clearable = true,
    disabled = false,
    id,
    className,
    width = "w-full",
  } = props;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false), open);

  const selectedValues = props.multiple
    ? props.value
    : props.value
      ? [props.value]
      : [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.description?.toLowerCase().includes(q) ?? false),
    );
  }, [options, query]);

  const label = (() => {
    if (props.multiple) {
      if (props.value.length === 0) return placeholder;
      if (props.value.length === 1) {
        return options.find((o) => o.value === props.value[0])?.label ?? placeholder;
      }
      return `${props.value.length} selected`;
    }
    if (!props.value) return placeholder;
    return options.find((o) => o.value === props.value)?.label ?? placeholder;
  })();

  const isPlaceholder = props.multiple ? props.value.length === 0 : !props.value;

  const select = (value: string) => {
    if (props.multiple) {
      const exists = props.value.includes(value);
      props.onChange(
        exists ? props.value.filter((v) => v !== value) : [...props.value, value],
      );
    } else {
      props.onChange(value);
      setOpen(false);
    }
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (props.multiple) props.onChange([]);
    else props.onChange(null);
  };

  return (
    <div className={cn("relative", width, className)} ref={ref}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-10 w-full items-center gap-2 rounded-md border border-input bg-surface px-3 text-sm transition-colors",
          "focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25",
          "disabled:cursor-not-allowed disabled:opacity-50",
          isPlaceholder ? "text-muted-foreground" : "text-foreground",
        )}
      >
        <span className="flex-1 truncate text-left">{label}</span>
        {clearable && !isPlaceholder ? (
          <span
            role="button"
            aria-label="Clear selection"
            onClick={clear}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        ) : null}
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open ? (
        <div className="absolute z-40 mt-2 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-overlay animate-scale-in">
          {searchable ? (
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="h-10 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
          ) : null}
          <div className="max-h-60 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No matches.
              </div>
            ) : (
              filtered.map((option) => {
                const active = selectedValues.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => select(option.value)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                      active ? "bg-surface-muted text-foreground" : "text-muted-foreground hover:bg-surface-muted",
                    )}
                  >
                    <span className="flex-1">
                      <span className="block text-foreground">{option.label}</span>
                      {option.description ? (
                        <span className="block text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                    {active ? <Check className="h-4 w-4 text-primary" /> : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Thin non-searchable single-select convenience wrapper. */
export function Select(props: Omit<SingleProps, "multiple" | "searchable">) {
  return <Combobox {...props} multiple={false} searchable={false} />;
}