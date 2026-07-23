import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "Leave" };

export default function LeavePage() {
  return (
    <ModulePlaceholder
      icon={CalendarDays}
      title="Leave"
      description="Balances, requests, and leave calendars."
      points={[
        "Balances that update as leave is taken.",
        "Simple requests with clear approval flows.",
        "A team calendar that keeps everyone aligned.",
      ]}
    />
  );
}
