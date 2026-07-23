import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "Copilot" };

export default function CopilotPage() {
  return (
    <ModulePlaceholder
      icon={Sparkles}
      title="Copilot"
      description="The full AI Copilot workspace — beyond the quick dock."
      points={[
        "A dedicated space for longer, multi-step questions.",
        "Grounded in your data, with sources you can inspect.",
        "Explains numbers and never moves money without approval.",
      ]}
    />
  );
}
