import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { RuntimeDirectoryPage } from "@/components/people/directory/runtime-directory-page";
import { AuthorizationError } from "@/platform/errors";
import { loadRuntimeDirectory } from "@/platform/people/directory-runtime-loader";

export const metadata: Metadata = { title: "People" };

export default async function PeopleDirectoryRoute({
  searchParams,
}: {
  searchParams: { q?: string; page?: string; view?: string; status?: string; department?: string };
}) {
  const page = Math.max(1, Number(searchParams.page) || 1);
  const status = searchParams.status ? searchParams.status.split(",").filter(Boolean) : [];
  try {
    const directory = await loadRuntimeDirectory({
      query: searchParams.q,
      offset: (page - 1) * 25,
      limit: 25,
      status,
      departmentId: searchParams.department,
    });
    return <RuntimeDirectoryPage directory={directory} view={searchParams.view === "cards" ? "cards" : "table"} />;
  } catch (error) {
    // AuthorizationError becomes a controlled 403; anything else (including
    // next/navigation's redirect() signal) must keep propagating unchanged.
    if (error instanceof AuthorizationError) return <AccessDenied message="You don't have permission to view the People directory." />;
    throw error;
  }
}
