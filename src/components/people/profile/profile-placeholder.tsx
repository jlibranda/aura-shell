import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/primitives";

/**
 * Consistent placeholder for profile tabs whose full experience lands in a
 * later milestone. Intentional and labeled — not an accidental blank screen.
 */
export function ProfilePlaceholder({
  icon,
  title,
}: {
  icon: LucideIcon;
  title: string;
}) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      description="This section will be implemented in the next milestone."
    />
  );
}