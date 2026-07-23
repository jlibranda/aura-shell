import type { Metadata } from "next";
import { Banknote } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "Payroll" };

export default function PayrollPage() {
  return (
    <ModulePlaceholder
      icon={Banknote}
      title="Payroll"
      description="Pay runs, payslips, and statutory filings."
      points={[
        "Guided pay runs that explain every number.",
        "Philippine statutory calculations, correct by default.",
        "Payslips and government-ready reports in a click.",
      ]}
    />
  );
}
