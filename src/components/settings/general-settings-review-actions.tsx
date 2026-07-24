"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { discardGeneralSettingsDraftAction, publishGeneralSettingsAction } from "@/app/(app)/settings/general/actions";

const today = () => new Date().toISOString().slice(0, 10);

export function GeneralSettingsReviewActions({ versionId, expectedUpdatedAt }: { versionId: string; expectedUpdatedAt: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const [effectiveUntil, setEffectiveUntil] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [confirming, setConfirming] = useState<"publish" | "discard" | undefined>();

  function publish() {
    startTransition(async () => {
      const result = await publishGeneralSettingsAction({
        versionId,
        expectedUpdatedAt,
        effectiveFrom,
        effectiveUntil: effectiveUntil || undefined,
      });
      setConfirming(undefined);
      if (result.kind === "success") {
        router.push("/settings/general");
        router.refresh();
        return;
      }
      if (result.kind === "validation_failure") {
        setError(result.issues[0]?.message ?? "This couldn't be published. Check the effective date.");
        return;
      }
      setError(result.kind === "conflict" ? result.message : "This couldn't be published. Please try again.");
    });
  }

  function discard() {
    startTransition(async () => {
      const result = await discardGeneralSettingsDraftAction({ versionId, expectedUpdatedAt });
      setConfirming(undefined);
      if (result.kind === "success") {
        router.push("/settings/general");
        router.refresh();
        return;
      }
      setError(result.kind === "conflict" ? result.message : "This draft couldn't be discarded. Please try again.");
    });
  }

  return (
    <>
      <Card className="p-5">
        {error ? (
          <div role="alert" className="mb-4 rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="effective-from" className="block text-sm font-medium text-foreground">Effective from</label>
            <input
              id="effective-from"
              type="date"
              value={effectiveFrom}
              onChange={(event) => setEffectiveFrom(event.target.value)}
              className="mt-1.5 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <p className="mt-1 text-xs text-muted-foreground">A future date schedules this version instead of applying it immediately.</p>
          </div>
          <div>
            <label htmlFor="effective-until" className="block text-sm font-medium text-foreground">Effective until (optional)</label>
            <input
              id="effective-until"
              type="date"
              value={effectiveUntil}
              onChange={(event) => setEffectiveUntil(event.target.value)}
              className="mt-1.5 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-5">
          <Link href="/settings/general/edit" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Back to edit
          </Link>
          <div className="flex gap-2">
            <Button variant="destructive" onClick={() => setConfirming("discard")} disabled={pending}>
              Discard draft
            </Button>
            <Button onClick={() => setConfirming("publish")} disabled={pending}>
              Publish
            </Button>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={confirming === "publish"}
        title="Publish this version?"
        description={`This will become the effective General Company Settings starting ${effectiveFrom}. You can always publish a new version later.`}
        confirmLabel="Publish"
        loading={pending}
        onConfirm={publish}
        onCancel={() => setConfirming(undefined)}
      />
      <ConfirmDialog
        open={confirming === "discard"}
        title="Discard this draft?"
        description="This cannot be undone. Your unpublished changes will be permanently removed."
        confirmLabel="Discard"
        tone="danger"
        loading={pending}
        onConfirm={discard}
        onCancel={() => setConfirming(undefined)}
      />
    </>
  );
}
