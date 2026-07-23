import { IdCard, CircleSlash } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { VerificationBadge } from "@/components/people/profile/verification-badge";
import { maskId, longDate } from "@/lib/people/format";
import type { GovIdView } from "@/lib/people/employment-presentation";
import { cn } from "@/lib/utils";

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const empty = value === "—";
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          empty ? "italic text-muted-foreground/60" : "text-foreground",
          mono && !empty && "tabular font-mono",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function GovernmentIdCard({ view }: { view: GovIdView }) {
  const isMissing = view.state === "missing";

  return (
    <Card className="flex flex-col p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg",
              isMissing ? "bg-surface-muted text-muted-foreground" : "bg-primary/10 text-primary",
            )}
          >
            <IdCard className="h-4.5 w-4.5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{view.label}</h3>
            <p className="text-xs text-muted-foreground">{view.source}</p>
          </div>
        </div>
        <VerificationBadge state={view.state} />
      </div>

      {isMissing ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface-muted/30 px-4 py-6 text-center">
          <CircleSlash className="h-5 w-5 text-muted-foreground/60" />
          <p className="mt-2 text-sm font-medium text-foreground">No {view.label} on file</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            This ID hasn&apos;t been recorded for this employee.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5 border-t border-border pt-3">
          <Detail label="Number" value={maskId(view.number)} mono />
          <Detail
            label="Date verified"
            value={view.dateVerified ? longDate(view.dateVerified) : "—"}
          />
          <Detail label="Source" value={view.source} />
          <Detail label="Last updated" value={longDate(view.lastUpdated)} />
        </div>
      )}
    </Card>
  );
}