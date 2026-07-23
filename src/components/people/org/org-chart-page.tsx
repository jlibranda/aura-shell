"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { OrgChart } from "@/components/people/org/org-chart";

export function OrgChartPage() {
  return (
    <div className="mx-auto max-w-[92rem]">
      <Link
        href="/people/org"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to organization
      </Link>

      <div className="mb-5 mt-4">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Organization chart</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          The full reporting structure, from the CEO down to every employee.
        </p>
      </div>

      <OrgChart />
    </div>
  );
}