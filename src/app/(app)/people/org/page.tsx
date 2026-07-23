import type { Metadata } from "next";
import { OrganizationPage } from "@/components/people/org/organization-page";

export const metadata: Metadata = { title: "Organization" };

export default function OrganizationRoute() {
  return <OrganizationPage />;
}