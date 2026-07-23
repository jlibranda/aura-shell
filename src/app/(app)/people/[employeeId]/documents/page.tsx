import type { Metadata } from "next";
import { RuntimeProfilePage } from "@/components/people/profile/runtime-profile-page";
import { loadRuntimeProfile } from "@/platform/people/profile-runtime-loader";

export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsTabRoute({ params }: { params: { employeeId: string } }) {
  return <RuntimeProfilePage result={await loadRuntimeProfile(params.employeeId)} activeTab="documents" />;
}
