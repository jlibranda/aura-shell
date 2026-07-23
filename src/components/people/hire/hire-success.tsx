"use client";

import Link from "next/link";
import { CheckCircle2, Eye, Users, UserPlus } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

export function HireSuccess({
  employeeId,
  employeeNumber,
  employeeName,
  onHireAnother,
}: {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  onHireAnother: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg py-8">
      <Card className="flex flex-col items-center p-8 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10 text-success">
          <CheckCircle2 className="h-7 w-7" />
        </span>
        <h1 className="mt-5 text-xl font-semibold tracking-tight text-foreground">
          Employee created
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {employeeName} has been added to your directory.
        </p>

        <div className="mt-5 w-full rounded-lg border border-border bg-surface-muted/50 px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Employee number
          </div>
          <div className="tabular mt-0.5 font-mono text-lg font-semibold text-foreground">
            {employeeNumber}
          </div>
        </div>

        <div className="mt-6 flex w-full flex-col gap-2">
          <Button asChild className="w-full">
            <Link href={`/people/${employeeId}`}>
              <Eye className="h-4 w-4" />
              View employee
            </Link>
          </Button>
          <div className="flex gap-2">
            <Button asChild variant="outline" className="flex-1">
              <Link href="/people">
                <Users className="h-4 w-4" />
                Back to directory
              </Link>
            </Button>
            <Button variant="outline" className="flex-1" onClick={onHireAnother}>
              <UserPlus className="h-4 w-4" />
              Hire another
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}