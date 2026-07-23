"use client";

import { useRouter } from "next/navigation";
import { MoreHorizontal, Eye, Sparkles, Copy } from "lucide-react";
import { DropdownMenu, MenuItem } from "@/components/ui/overlay";
import { IconButton } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useUIStore } from "@/stores/ui-store";
import { fullName } from "@/lib/people/directory-query";
import type { Employee } from "@/lib/people/people-types";

/**
 * Quick actions available from a directory row or card. Lifecycle actions
 * (edit, promote, terminate, …) are a later milestone; this exposes the
 * navigation and Copilot entry points that are in scope now.
 */
export function EmployeeRowMenu({
  employee,
  align = "end",
}: {
  employee: Employee;
  align?: "start" | "end";
}) {
  const router = useRouter();
  const setCopilotOpen = useUIStore((s) => s.setCopilotOpen);
  const name = fullName(employee);

  return (
    <DropdownMenu
      align={align}
      width="w-52"
      trigger={({ toggle }) => (
        <IconButton
          label={`Actions for ${name}`}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
        >
          <MoreHorizontal className="h-4 w-4" />
        </IconButton>
      )}
    >
      {(close) => (
        <>
          <MenuItem
            icon={Eye}
            onClick={() => {
              close();
              router.push(`/people/${employee.id}`);
            }}
          >
            View profile
          </MenuItem>
          <MenuItem
            icon={Copy}
            onClick={() => {
              close();
              if (typeof navigator !== "undefined" && navigator.clipboard) {
                navigator.clipboard
                  .writeText(employee.employeeNumber)
                  .then(() => toast("Employee ID copied", { description: employee.employeeNumber }))
                  .catch(() => toast.error("Couldn't copy to clipboard"));
              }
            }}
          >
            Copy employee ID
          </MenuItem>
          <MenuItem
            icon={Sparkles}
            onClick={() => {
              close();
              setCopilotOpen(true);
            }}
          >
            Ask Copilot
          </MenuItem>
        </>
      )}
    </DropdownMenu>
  );
}