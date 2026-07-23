import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <ModulePlaceholder
      icon={BarChart3}
      title="Reports"
      description="Analytics, statutory reports, and exports."
      points={[
        "Workforce and labor-cost analytics that explain themselves.",
        "Government-ready statutory reports.",
        "Flexible exports for finance and audit.",
      ]}
    />
  );
}
