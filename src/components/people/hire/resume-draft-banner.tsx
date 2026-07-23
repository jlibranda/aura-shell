"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

export function ResumeDraftBanner({
  updatedAt,
  onResume,
  onDiscard,
}: {
  updatedAt: string;
  onResume: () => void;
  onDiscard: () => void;
}) {
  const when = (() => {
    const d = new Date(updatedAt);
    if (Number.isNaN(d.getTime())) return "earlier";
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  })();

  return (
    <Card className="mb-5 flex flex-col gap-3 border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <RotateCcw className="h-4.5 w-4.5" />
        </span>
        <div>
          <p className="text-sm font-medium text-foreground">You have a saved draft</p>
          <p className="text-xs text-muted-foreground">Last updated {when}.</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onDiscard}>
          <Trash2 className="h-4 w-4" />
          Discard
        </Button>
        <Button size="sm" onClick={onResume}>
          <RotateCcw className="h-4 w-4" />
          Resume draft
        </Button>
      </div>
    </Card>
  );
}