"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Network, FolderClosed } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/people", label: "Directory", icon: Users, exactPrefixes: ["/people"] },
  { href: "/people/org", label: "Organization", icon: Network, exactPrefixes: ["/people/org"] },
  { href: "/people/documents", label: "Documents", icon: FolderClosed, exactPrefixes: ["/people/documents"] },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/people") {
    // Directory owns /people and /people/[id], but not /org or /documents.
    return (
      pathname === "/people" ||
      (pathname.startsWith("/people/") &&
        !pathname.startsWith("/people/org") &&
        !pathname.startsWith("/people/documents"))
    );
  }
  return pathname === href || pathname.startsWith(href + "/");
}

export function PeopleSubNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 border-b border-border" aria-label="People sections">
      {LINKS.map((link) => {
        const active = isActive(pathname, link.href);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex items-center gap-2 px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-none",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {link.label}
            {active ? (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}