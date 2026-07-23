import type { Metadata } from "next";
import { Clock } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "Time" };

export default function TimePage() {
  return (
    <ModulePlaceholder
      icon={Clock}
      title="Time"
      description="Timekeeping, schedules, and attendance."
      points={[
        "Clock-ins, schedules, and shift management.",
        "Overtime, night differential, and holiday rules.",
        "Attendance that flows straight into payroll.",
      ]}
    />
  );
}
