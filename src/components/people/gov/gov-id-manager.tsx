"use client";

import { useState } from "react";
import { Eye, EyeOff, Copy, Pencil, ShieldCheck, ShieldX, Check, X } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { Button, IconButton } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import { GovStatusBadge } from "@/components/people/gov/gov-status-badge";
import { usePeopleRepository } from "@/lib/people/people-repository";
import { useGovVerificationStore } from "@/stores/gov-verification-store";
import { CURRENT_USER } from "@/lib/mock-data";
import { fullName } from "@/lib/people/directory-query";
import { longDate } from "@/lib/people/format";
import {
  GOV_ID_LABELS,
  GOV_ID_ORDER,
  maskGovNumber,
  resolveGovStatus,
  govKey,
} from "@/lib/people/gov-verification";
import type { Employee, GovIdKey, TimelineEvent } from "@/lib/people/people-types";
import { cn } from "@/lib/utils";

function timelineEvent(employee: Employee, title: string, description: string): TimelineEvent {
  return {
    id: `tl-${employee.id}-gov-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    type: "note_added",
    title,
    description,
    timestamp: new Date().toISOString(),
    actor: CURRENT_USER.name,
  };
}

function GovIdRow({ employee, idKey }: { employee: Employee; idKey: GovIdKey }) {
  const updateEmployee = usePeopleRepository((s) => s.updateEmployee);
  const override = useGovVerificationStore((s) => s.records[govKey(employee.id, idKey)]);
  const markUpdated = useGovVerificationStore((s) => s.markUpdated);
  const verify = useGovVerificationStore((s) => s.verify);
  const reject = useGovVerificationStore((s) => s.reject);

  const number = employee.governmentIds[idKey].number;
  const status = resolveGovStatus(employee, idKey, override);

  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftNumber, setDraftNumber] = useState(number ?? "");
  const [verifyMode, setVerifyMode] = useState<null | "verify" | "reject">(null);
  const [notes, setNotes] = useState("");

  const label = GOV_ID_LABELS[idKey];

  const saveNumber = () => {
    const value = draftNumber.trim();
    updateEmployee(employee.id, {
      timeline: [
        timelineEvent(employee, "Government ID updated", `${label} was updated.`),
        ...employee.timeline,
      ],
    });
    // Patch the number via a shallow governmentIds update.
    updateEmployee(employee.id, {
      // @ts-expect-error governmentIds is a valid partial patch on the employee record
      governmentIds: {
        ...employee.governmentIds,
        [idKey]: { number: value || null, verified: false },
      },
    });
    markUpdated(employee.id, idKey, Boolean(value));
    setEditing(false);
    toast.success(`${label} updated`);
  };

  const doVerify = () => {
    verify(employee.id, idKey, notes);
    updateEmployee(employee.id, {
      timeline: [
        timelineEvent(employee, "Government ID verified", `${label} was verified.`),
        ...employee.timeline,
      ],
    });
    setVerifyMode(null);
    setNotes("");
    toast.success(`${label} verified`);
  };

  const doReject = () => {
    reject(employee.id, idKey, notes);
    updateEmployee(employee.id, {
      timeline: [
        timelineEvent(employee, "Government ID rejected", `${label} was rejected.`),
        ...employee.timeline,
      ],
    });
    setVerifyMode(null);
    setNotes("");
    toast(`${label} rejected`);
  };

  const copyNumber = () => {
    if (!number) return;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard
        .writeText(number)
        .then(() => toast(`${label} copied`))
        .catch(() => toast.error("Couldn't copy"));
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-foreground">{label}</h4>
            <GovStatusBadge status={status} />
          </div>
          <div className="mt-1 font-mono text-sm text-foreground">
            {number ? (revealed ? number : maskGovNumber(number)) : <span className="italic text-muted-foreground/60">Not provided</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {number ? (
            <>
              <IconButton label={revealed ? "Hide" : "Reveal"} onClick={() => setRevealed((v) => !v)}>
                {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </IconButton>
              <IconButton label="Copy" onClick={copyNumber}>
                <Copy className="h-4 w-4" />
              </IconButton>
            </>
          ) : null}
          <IconButton
            label="Edit"
            onClick={() => {
              setDraftNumber(number ?? "");
              setEditing((v) => !v);
              setVerifyMode(null);
            }}
          >
            <Pencil className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      {editing ? (
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
          <Input
            value={draftNumber}
            onChange={(e) => setDraftNumber(e.target.value)}
            placeholder={`Enter ${label} number`}
            className="font-mono"
          />
          <Button size="sm" onClick={saveNumber}>
            <Check className="h-4 w-4" />
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      {override?.status === "verified" || override?.status === "rejected" ? (
        <div className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {override.status === "verified" ? "Verified" : "Rejected"}
          </span>{" "}
          by {override.verifiedBy} on {override.verifiedAt ? longDate(override.verifiedAt.slice(0, 10)) : "—"}
          {override.notes ? <div className="mt-0.5">Notes: {override.notes}</div> : null}
        </div>
      ) : null}

      {number && !editing ? (
        verifyMode ? (
          <div className="mt-3 space-y-2 border-t border-border pt-3">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={verifyMode === "verify" ? "Verification notes (optional)" : "Reason for rejection"}
            />
            <div className="flex items-center gap-2">
              {verifyMode === "verify" ? (
                <Button size="sm" onClick={doVerify}>
                  <ShieldCheck className="h-4 w-4" />
                  Confirm verify
                </Button>
              ) : (
                <Button size="sm" variant="destructive" onClick={doReject}>
                  <ShieldX className="h-4 w-4" />
                  Confirm reject
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setVerifyMode(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
            <Button size="sm" variant="outline" onClick={() => setVerifyMode("verify")} disabled={status === "verified"}>
              <ShieldCheck className="h-4 w-4" />
              Verify
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setVerifyMode("reject")} disabled={status === "rejected"}>
              <ShieldX className="h-4 w-4" />
              Reject
            </Button>
          </div>
        )
      ) : null}
    </Card>
  );
}

export function GovIdManager({ employee }: { employee: Employee }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {GOV_ID_ORDER.map((idKey) => (
        <GovIdRow key={idKey} employee={employee} idKey={idKey} />
      ))}
    </div>
  );
}