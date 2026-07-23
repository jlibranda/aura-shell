import type { Metadata } from "next";
import { PeopleCopilotLoader } from "@/components/people/copilot/people-copilot-loader";

export const metadata: Metadata = { title: "People Copilot" };

export default function PeopleCopilotRoute() {
  return <PeopleCopilotLoader />;
}