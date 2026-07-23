"use client";

import { useRouter } from "next/navigation";
import { UserX } from "lucide-react";
import { EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

export function ProfileNotFound({ employeeId }: { employeeId?: string }) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-2xl py-6">
      <EmptyState
        icon={UserX}
        title="Employee not found"
        description={
          employeeId
            ? `No employee matches the ID “${employeeId}”. They may have been removed, or the link may be incorrect.`
            : "This employee record doesn't exist or is no longer available."
        }
        action={
          <Button onClick={() => router.push("/people")}>Back to directory</Button>
        }
      />
    </div>
  );
}