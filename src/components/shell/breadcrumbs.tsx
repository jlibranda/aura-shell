"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { navItemForPath } from "@/lib/navigation";

/**
 * Breadcrumbs are derived from the active route and the shared nav config,
 * so labels stay consistent with the sidebar and command palette.
 */
export function Breadcrumbs() {
  const pathname = usePathname();
  const current = navItemForPath(pathname);

  return (
    <nav aria-label="Breadcrumb" className="flex items-center text-sm">
      <ol className="flex items-center gap-1.5">
        <li>
          <Link
            href="/home"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            AURA
          </Link>
        </li>
        {current ? (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
            <li>
              <span
                aria-current="page"
                className="font-medium text-foreground"
              >
                {current.label}
              </span>
            </li>
          </>
        ) : null}
      </ol>
    </nav>
  );
}
