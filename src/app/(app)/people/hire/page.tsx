import type { Metadata } from "next";
import { RuntimeHirePage } from "@/components/people/hire/runtime-hire-page";
import { loadRuntimeHireReferences } from "@/platform/people/runtime-hire-loader";

export const metadata: Metadata = { title: "Hire employee" };
export const dynamic = "force-dynamic";

export default async function HireRoute() {
  return <RuntimeHirePage references={await loadRuntimeHireReferences()} />;
}
