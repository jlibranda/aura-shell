import type { Metadata } from "next";
import { RuntimeDirectoryPage } from "@/components/people/directory/runtime-directory-page";
import { loadRuntimeDirectory } from "@/platform/people/directory-runtime-loader";

export const metadata: Metadata = { title: "People" };

export default async function PeopleDirectoryRoute({ searchParams }: { searchParams: { q?: string; page?: string; view?: string } }) {
  const page = Math.max(1, Number(searchParams.page) || 1);
  const directory = await loadRuntimeDirectory({ query: searchParams.q, offset: (page - 1) * 25, limit: 25 });
  return <RuntimeDirectoryPage directory={directory} view={searchParams.view === "cards" ? "cards" : "table"} />;
}
