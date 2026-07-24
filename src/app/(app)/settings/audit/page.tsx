import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { AccessDenied } from "@/components/shared/access-denied";
import { Card, EmptyState } from "@/components/ui/primitives";
import { loadConfigurationAuditTrail } from "@/platform/configuration/general-settings-loader";

export const metadata: Metadata = { title: "Configuration audit trail" };
export const dynamic = "force-dynamic";

const EVENT_LABELS: Record<string, string> = {
  "configuration.draft.created": "Draft created",
  "configuration.draft.updated": "Draft updated",
  "configuration.draft.discarded": "Draft discarded",
  "configuration.version.published": "Version published",
  "configuration.version.retired": "Version retired",
};

export default async function ConfigurationAuditPage() {
  const result = await loadConfigurationAuditTrail();
  if (result.kind === "unauthorized") return <AccessDenied message="You don't have permission to view the settings audit trail." />;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Audit and Diagnostics</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Every configuration change is recorded immutably, with who made it and when.</p>
      </div>

      {result.records.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No configuration activity yet" description="Once someone creates, publishes, or discards a settings draft, it will show up here." />
      ) : (
        <Card className="divide-y divide-border p-0">
          {result.records.map((record) => (
            <div key={record.auditId} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
              <div>
                <p className="font-medium text-foreground">{EVENT_LABELS[record.eventName] ?? record.eventName}</p>
                <p className="text-xs text-muted-foreground">by {record.actorUserId} · correlation {record.correlationId}</p>
              </div>
              <time dateTime={record.occurredAt} className="text-xs text-muted-foreground">
                {new Date(record.occurredAt).toLocaleString()}
              </time>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
