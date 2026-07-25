import type { Metadata } from "next";
import { RuntimeProfilePage } from "@/components/people/profile/runtime-profile-page";
import { loadRuntimeProfile } from "@/platform/people/profile-runtime-loader";
import { loadEmploymentActionsSurface } from "@/platform/people/profile-employment-actions-loader";

export const metadata: Metadata = { title: "Employment" };

export default async function EmploymentTabRoute({ params }: { params: { employeeId: string } }) {
  const [result, employmentActions] = await Promise.all([
    loadRuntimeProfile(params.employeeId),
    loadEmploymentActionsSurface(params.employeeId),
  ]);
  return <RuntimeProfilePage result={result} activeTab="employment" employmentActions={employmentActions} />;
}
