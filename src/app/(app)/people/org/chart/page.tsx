import type { Metadata } from "next";
import { OrgChartPage } from "@/components/people/org/org-chart-page";

export const metadata: Metadata = { title: "Org chart" };

export default function OrgChartRoute() {
  return <OrgChartPage />;
}