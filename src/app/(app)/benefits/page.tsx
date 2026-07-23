import type { Metadata } from "next";
import { HeartPulse } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "Benefits" };

export default function BenefitsPage() {
  return (
    <ModulePlaceholder
      icon={HeartPulse}
      title="Benefits"
      description="Statutory and company benefits."
      points={[
        "SSS, PhilHealth, and Pag-IBIG enrollment at a glance.",
        "Company benefits and perks in one place.",
        "Clear visibility for employees into their coverage.",
      ]}
    />
  );
}
