"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Sheet } from "@/components/ui/overlay";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  side?: "left" | "right";
  width?: "sm" | "md";
  isDirty?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Form drawer built on the shell's Sheet. Adds a titled header, scrollable body,
 * sticky footer, and a dirty-state guard that confirms before discarding.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  side = "right",
  width = "md",
  isDirty = false,
  footer,
  children,
  className,
}: DrawerProps) {
  const [confirming, setConfirming] = useState(false);

  const requestClose = () => {
    if (isDirty) {
      setConfirming(true);
      return;
    }
    onClose();
  };

  const confirmDiscard = () => {
    setConfirming(false);
    onClose();
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={requestClose}
        side={side}
        width={width}
        labelledBy="drawer-title"
        className={className}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id="drawer-title" className="text-base font-semibold text-foreground">
              {title}
            </h2>
            {description ? (
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <button
            onClick={requestClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-foreground focus-visible:outline-none"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className={cn("flex-1 overflow-y-auto px-5 py-5")}>{children}</div>

        {footer ? (
          <div className="border-t border-border px-5 py-4">{footer}</div>
        ) : null}
      </Sheet>

      <ConfirmDialog
        open={confirming}
        title="Discard changes?"
        description="You have unsaved changes. Closing now will discard them."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        tone="danger"
        onConfirm={confirmDiscard}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

export function DrawerFooterActions({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="flex items-center justify-end gap-2">{children}</div>;
}