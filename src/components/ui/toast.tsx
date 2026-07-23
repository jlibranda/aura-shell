"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastVariant = "default" | "success" | "error" | "warning" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration: number;
  action?: ToastAction;
}

interface ToastState {
  toasts: ToastItem[];
  push: (toast: Omit<ToastItem, "id">) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (toast) => {
    const id = `toast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

interface ToastOptions {
  description?: string;
  duration?: number;
  action?: ToastAction;
}

function emit(variant: ToastVariant, title: string, options: ToastOptions = {}) {
  return useToastStore.getState().push({
    title,
    variant,
    description: options.description,
    duration: options.duration ?? (variant === "error" ? 6000 : 4000),
    action: options.action,
  });
}

/** Imperative toast API — callable from anywhere (no hook required). */
export const toast = Object.assign(
  (title: string, options?: ToastOptions) => emit("default", title, options),
  {
    success: (title: string, options?: ToastOptions) => emit("success", title, options),
    error: (title: string, options?: ToastOptions) => emit("error", title, options),
    warning: (title: string, options?: ToastOptions) => emit("warning", title, options),
    info: (title: string, options?: ToastOptions) => emit("info", title, options),
    dismiss: (id: string) => useToastStore.getState().dismiss(id),
    clear: () => useToastStore.getState().clear(),
  },
);

const VARIANT_ICON = {
  default: Info,
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

const VARIANT_COLOR: Record<ToastVariant, string> = {
  default: "text-muted-foreground",
  success: "text-success",
  error: "text-danger",
  warning: "text-warning",
  info: "text-info",
};

function ToastCard({ item }: { item: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const Icon = VARIANT_ICON[item.variant];

  useEffect(() => {
    if (item.duration <= 0) return;
    const timer = setTimeout(() => dismiss(item.id), item.duration);
    return () => clearTimeout(timer);
  }, [item.id, item.duration, dismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto flex w-80 max-w-[calc(100vw-2rem)] items-start gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-overlay animate-scale-in"
    >
      <span className={cn("mt-0.5 shrink-0", VARIANT_COLOR[item.variant])}>
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug text-foreground">{item.title}</p>
        {item.description ? (
          <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
            {item.description}
          </p>
        ) : null}
        {item.action ? (
          <button
            onClick={() => {
              item.action?.onClick();
              dismiss(item.id);
            }}
            className="mt-2 text-sm font-medium text-primary hover:underline"
          >
            {item.action.label}
          </button>
        ) : null}
      </div>
      <button
        onClick={() => dismiss(item.id)}
        aria-label="Dismiss notification"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-foreground focus-visible:outline-none"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * Mounts the toast viewport. Render once near the app root of any tree that
 * needs toasts. Safe to render on the server (portals only after mount).
 */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[60] flex flex-col items-end justify-end gap-2 p-4 sm:p-6">
      {toasts.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>,
    document.body,
  );
}