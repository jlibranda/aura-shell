"use client";

import Link from "next/link";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Standalone entry point to the Hire Wizard. Usable anywhere in the People
 * domain that needs a "New Employee" call to action.
 */
export function NewEmployeeButton({
  size = "sm",
  variant = "primary",
  label = "New employee",
}: {
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "outline";
  label?: string;
}) {
  return (
    <Button asChild size={size} variant={variant}>
      <Link href="/people/hire">
        <UserPlus className="h-4 w-4" />
        {label}
      </Link>
    </Button>
  );
}