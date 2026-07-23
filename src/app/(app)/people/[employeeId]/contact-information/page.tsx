import type { Metadata } from "next";
import { RuntimeProfilePage } from "@/components/people/profile/runtime-profile-page";
import { loadRuntimeProfile } from "@/platform/people/profile-runtime-loader";

export const metadata: Metadata = { title: "Contact Information" };

export default async function ContactInformationRoute({ params }: { params: { employeeId: string } }) {
  return <RuntimeProfilePage result={await loadRuntimeProfile(params.employeeId)} activeTab="contact-information" />;
}
