"use client";

import { useRouter } from "next/navigation";
import { Users, SearchX, FilterX, UserPlus } from "lucide-react";
import { EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

/** Shown when the organization has no employees at all. */
export function DirectoryEmptyState() {
  const router = useRouter();
  return (
    <EmptyState
      icon={Users}
      title="No employees yet"
      description="Add your first employee to start building your directory. Everyone you hire will appear here."
      action={
        <Button onClick={() => router.push("/people/new")}>
          <UserPlus className="h-4 w-4" />
          Add employee
        </Button>
      }
    />
  );
}

/** Shown when a search term returns nothing. */
export function DirectoryNoSearchResults({
  term,
  onClear,
}: {
  term: string;
  onClear: () => void;
}) {
  return (
    <EmptyState
      icon={SearchX}
      title={`No matches for “${term}”`}
      description="Check the spelling, or try searching by name, employee ID, email, or job title."
      action={
        <Button variant="secondary" onClick={onClear}>
          Clear search
        </Button>
      }
    />
  );
}

/** Shown when active filters exclude everyone. */
export function DirectoryNoFilterResults({ onClear }: { onClear: () => void }) {
  return (
    <EmptyState
      icon={FilterX}
      title="No people match these filters"
      description="Try loosening or removing a filter to widen your results."
      action={
        <Button variant="secondary" onClick={onClear}>
          Clear filters
        </Button>
      }
    />
  );
}