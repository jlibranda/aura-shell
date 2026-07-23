import type { CopilotViewer } from "@/lib/people/copilot/access-policy";

export interface CopilotAuditEvent {
  id: string;
  user: string;
  employeeId: string;
  field: string;
  action: "viewed" | "revealed" | "copied";
  timestamp: string;
}

const events: CopilotAuditEvent[] = [];

export function logCopilotAudit(viewer: CopilotViewer, employeeId: string, field: string, action: CopilotAuditEvent["action"]): void {
  events.unshift({ id: `copilot-audit-${Date.now()}-${events.length}`, user: viewer.name, employeeId, field, action, timestamp: new Date().toISOString() });
}

export function getCopilotAuditEvents(): readonly CopilotAuditEvent[] {
  return events;
}
