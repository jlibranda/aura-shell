"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn, initials as toInitials } from "@/lib/utils";
import { useHotkey, useOutsideClick } from "@/lib/hooks";

/* -------------------------------------------------------------------------- */
/* Portal helper                                                              */
/* -------------------------------------------------------------------------- */

function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

/* -------------------------------------------------------------------------- */
/* Modal — centered dialog (command palette, global search)                   */
/* -------------------------------------------------------------------------- */

export function Modal({
  open,
  onClose,
  children,
  align = "center",
  labelledBy,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  align?: "center" | "top";
  labelledBy?: string;
  className?: string;
}) {
  useHotkey("escape", onClose, { enabled: open });

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <Portal>
      <div
        className={cn(
          "fixed inset-0 z-50 flex justify-center px-4",
          align === "center" ? "items-center" : "items-start pt-[12vh]",
        )}
      >
        <div
          className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px] animate-fade-in"
          onClick={onClose}
          aria-hidden
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          className={cn(
            "relative z-10 w-full max-w-lg rounded-xl border border-border bg-surface shadow-overlay animate-scale-in",
            className,
          )}
        >
          {children}
        </div>
      </div>
    </Portal>
  );
}

/* -------------------------------------------------------------------------- */
/* Sheet — edge slide-over (Copilot dock, mobile nav, notifications on mobile)*/
/* -------------------------------------------------------------------------- */

export function Sheet({
  open,
  onClose,
  side = "right",
  children,
  width = "sm",
  labelledBy,
  className,
}: {
  open: boolean;
  onClose: () => void;
  side?: "left" | "right";
  children: React.ReactNode;
  width?: "sm" | "md";
  labelledBy?: string;
  className?: string;
}) {
  useHotkey("escape", onClose, { enabled: open });

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-50">
        <div
          className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px] animate-fade-in"
          onClick={onClose}
          aria-hidden
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          className={cn(
            "absolute top-0 flex h-full flex-col border-border bg-surface shadow-overlay",
            side === "right"
              ? "right-0 border-l animate-slide-in-right"
              : "left-0 border-r animate-slide-in-left",
            width === "sm" ? "w-full max-w-sm" : "w-full max-w-md",
            className,
          )}
        >
          {children}
        </div>
      </div>
    </Portal>
  );
}

export function SheetHeader({
  title,
  onClose,
  id,
  accent,
  children,
}: {
  title: string;
  onClose: () => void;
  id?: string;
  accent?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-border px-5 py-4",
        accent && "aura-glow",
      )}
    >
      <div className="flex items-center gap-2.5">{children}</div>
      <div className="flex items-center gap-1">
        <h2 id={id} className="sr-only">
          {title}
        </h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-foreground focus-visible:outline-none"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* DropdownMenu — anchored popover menu                                       */
/* -------------------------------------------------------------------------- */

export function DropdownMenu({
  trigger,
  children,
  align = "end",
  className,
  width = "w-56",
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "start" | "end";
  className?: string;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false), open);
  useHotkey("escape", () => setOpen(false), { enabled: open });

  return (
    <div className="relative" ref={ref}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open ? (
        <div
          role="menu"
          className={cn(
            "absolute z-40 mt-2 overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-overlay animate-scale-in",
            align === "end" ? "right-0" : "left-0",
            width,
            className,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({
  icon: Icon,
  children,
  onClick,
  tone = "default",
  trailing,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  onClick?: () => void;
  tone?: "default" | "danger";
  trailing?: React.ReactNode;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors focus-visible:outline-none",
        tone === "danger"
          ? "text-danger hover:bg-danger/10"
          : "text-foreground hover:bg-surface-muted",
      )}
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0 opacity-80" /> : null}
      <span className="flex-1 text-left">{children}</span>
      {trailing}
    </button>
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tooltip — lightweight hover/focus label                                    */
/* -------------------------------------------------------------------------- */

export function Tooltip({
  label,
  side = "right",
  children,
}: {
  label: string;
  side?: "right" | "top" | "bottom";
  children: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const open = () => {
    timer.current = setTimeout(() => setShow(true), 250);
  };
  const close = () => {
    clearTimeout(timer.current);
    setShow(false);
  };

  const pos =
    side === "right"
      ? "left-full top-1/2 ml-2 -translate-y-1/2"
      : side === "top"
        ? "bottom-full left-1/2 mb-2 -translate-x-1/2"
        : "top-full left-1/2 mt-2 -translate-x-1/2";

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
    >
      {children}
      {show ? (
        <span
          role="tooltip"
          className={cn(
            "pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-border bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md animate-fade-in",
            pos,
          )}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Avatar                                                                     */
/* -------------------------------------------------------------------------- */

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dim =
    size === "sm" ? "h-7 w-7 text-[11px]" : size === "lg" ? "h-11 w-11 text-sm" : "h-9 w-9 text-xs";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-primary/12 font-semibold text-primary ring-1 ring-inset ring-primary/15",
        dim,
        className,
      )}
      aria-hidden
    >
      {toInitials(name)}
    </span>
  );
}
