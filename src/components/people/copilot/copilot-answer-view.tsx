"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import { EmployeeStatusBadge } from "@/components/people/shared/employee-status-badge";
import { Avatar } from "@/components/ui/overlay";
import { fullName } from "@/lib/people/directory-query";
import type { CopilotAnswer } from "@/lib/people/copilot/types";
import { cn } from "@/lib/utils";
import { logCopilotAudit } from "@/lib/people/copilot/copilot-audit";
import { currentCopilotViewer } from "@/lib/people/copilot/access-policy";

interface CopilotAnswerViewProps {
  answer: CopilotAnswer;
  compact?: boolean;
}

/** Renders every grounded answer shape returned by the People Copilot service. */
export function CopilotAnswerView({ answer, compact = false }: CopilotAnswerViewProps) {
  const [revealed, setRevealed] = useState(Boolean(answer.governmentId?.fullValue));
  const governmentId = answer.governmentId;
  const viewer = currentCopilotViewer(answer.employees ?? []);
  return (
    <div className="space-y-3">
      <p className={cn("text-sm font-medium", answer.empty ? "text-muted-foreground" : "text-foreground")}>
        {answer.headline}
      </p>

      {answer.detail?.length ? (
        <ul className="space-y-1 text-sm text-muted-foreground">
          {answer.detail.map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}
        </ul>
      ) : null}

      {answer.counts?.length ? (
        <div className="divide-y divide-border rounded-lg border border-border">
          {answer.counts.map((row) => (
            <div key={row.label} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="tabular font-semibold text-foreground">{row.value}</span>
            </div>
          ))}
        </div>
      ) : null}

      {answer.profile ? (
        <div className="rounded-lg border border-border"><div className="divide-y divide-border">{answer.profile.rows.map((row) => <div key={row.label} className="flex items-center justify-between gap-3 px-3 py-2 text-sm"><span className="text-muted-foreground">{row.label}</span><span className="text-right font-medium text-foreground">{row.value}</span></div>)}</div><div className="flex gap-2 border-t border-border p-2"><Link href={`/people/${answer.profile.employee.id}`} className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground">Open profile</Link><button disabled className="rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground disabled:opacity-60">Edit employee</button><button disabled className="rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground disabled:opacity-60">View timeline</button></div></div>
      ) : null}

      {governmentId ? (
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-foreground">{governmentId.label}</div><div className="mt-1 font-mono text-sm text-foreground">{revealed && governmentId.fullValue ? governmentId.fullValue : governmentId.maskedValue}</div><div className="mt-1 text-xs text-muted-foreground">{governmentId.status}</div></div><div className="flex gap-1">{governmentId.canReveal ? <button aria-label={revealed ? "Hide" : "Reveal"} onClick={() => { const next = !revealed; setRevealed(next); if (next) logCopilotAudit(viewer, governmentId.employeeId, governmentId.label, "revealed"); }} className="rounded p-1 text-muted-foreground hover:bg-surface-muted">{revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button> : null}{governmentId.canCopy ? <button aria-label="Copy" onClick={() => { const value = governmentId.fullValue; if (value && navigator.clipboard) { navigator.clipboard.writeText(value); logCopilotAudit(viewer, governmentId.employeeId, governmentId.label, "copied"); } }} className="rounded p-1 text-muted-foreground hover:bg-surface-muted"><Copy className="h-4 w-4" /></button> : null}</div></div>
        </div>
      ) : null}

      {answer.navigation ? <Link href={answer.navigation.href} className="inline-flex rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">Open {answer.navigation.label}</Link> : null}

      {answer.timeline?.length ? <div className="space-y-2 rounded-lg border border-border p-3">{answer.timeline.map((event) => <div key={`${event.date}-${event.title}`} className="border-l-2 border-primary/40 pl-3"><div className="text-sm font-medium text-foreground">{event.title}</div><div className="text-xs text-muted-foreground">{event.date}</div>{event.description ? <div className="mt-1 text-sm text-muted-foreground">{event.description}</div> : null}</div>)}</div> : null}

      {answer.employees?.length ? (
        <div className="space-y-1.5">
          <div className="text-xs text-muted-foreground">
            {answer.employees.length} {answer.employees.length === 1 ? "person" : "people"}
          </div>
          <div className={cn("space-y-1.5 overflow-y-auto pr-1", compact ? "max-h-52" : "max-h-72")}>
            {answer.employees.map((employee) => (
              <Link key={employee.id} href={`/people/${employee.id}`} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 transition-colors hover:bg-surface-muted focus-visible:outline-none">
                <Avatar name={fullName(employee)} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{fullName(employee)}</span>
                  <span className="block truncate text-xs text-muted-foreground">{employee.employment.positionTitle} · {employee.employeeNumber}</span>
                </span>
                <EmployeeStatusBadge status={employee.status} />
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
