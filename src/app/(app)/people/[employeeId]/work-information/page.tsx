import type { Metadata } from "next";
import { RuntimeProfilePage } from "@/components/people/profile/runtime-profile-page";
import { loadRuntimeProfile } from "@/platform/people/profile-runtime-loader";
import { loadOrganizationPathForEmployee } from "@/platform/people/profile-employment-actions-loader";

export const metadata: Metadata = { title: "Work Information" };

export default async function WorkInformationRoute({ params }: { params: { employeeId: string } }) {
  const [result, organizationPath] = await Promise.all([
    loadRuntimeProfile(params.employeeId),
    loadOrganizationPathForEmployee(params.employeeId),
  ]);
  return <RuntimeProfilePage result={result} activeTab="work-information" organizationPath={organizationPath} />;
}
