import Link from "next/link";
import { Avatar } from "@/components/ui/overlay";
import { fullName } from "@/lib/people/directory-query";
import type { Employee } from "@/lib/people/people-types";
import { cn } from "@/lib/utils";

export function PersonCell({
  employee,
  href,
  secondary = "email",
  size = "md",
  className,
}: {
  employee: Employee;
  href?: string;
  secondary?: "email" | "employeeNumber" | "position" | "none";
  size?: "sm" | "md";
  className?: string;
}) {
  const name = fullName(employee);

  const sub =
    secondary === "email"
      ? employee.personal.email
      : secondary === "employeeNumber"
        ? employee.employeeNumber
        : secondary === "position"
          ? employee.employment.positionTitle
          : null;

  const content = (
    <span className={cn("flex min-w-0 items-center gap-3", className)}>
      <Avatar name={name} size={size} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">{name}</span>
        {sub ? (
          <span className="block truncate text-xs text-muted-foreground">{sub}</span>
        ) : null}
      </span>
    </span>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="inline-flex min-w-0 rounded-md focus-visible:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </Link>
    );
  }
  return content;
}