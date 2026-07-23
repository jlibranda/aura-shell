"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeft, Sparkles } from "lucide-react";
import { NAV_ITEMS, NAV_SECTIONS, type NavItem } from "@/lib/navigation";
import { useUIStore } from "@/stores/ui-store";
import { Tooltip } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";

function NavLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
        collapsed && "justify-center px-0",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
      )}
    >
      {active ? (
        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
      ) : null}
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed ? <span className="truncate">{item.label}</span> : null}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip label={item.label} side="right">
        {link}
      </Tooltip>
    );
  }
  return link;
}

export function SidebarContent({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div
        className={cn(
          "flex h-14 items-center gap-2.5 px-4",
          collapsed && "justify-center px-0",
        )}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-aura">
          <Sparkles className="h-4 w-4" />
        </span>
        {!collapsed ? (
          <span className="text-[15px] font-semibold tracking-tight text-foreground">
            AURA
          </span>
        ) : null}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {NAV_SECTIONS.map((section) => {
          const items = NAV_ITEMS.filter((i) => i.section === section.key);
          if (items.length === 0) return null;
          return (
            <div key={section.key} className="mb-4 last:mb-0">
              {!collapsed ? (
                <div className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {section.label}
                </div>
              ) : (
                <div className="mx-auto mb-1.5 h-px w-6 bg-border" />
              )}
              <ul className="space-y-0.5">
                {items.map((item) => (
                  <li key={item.key}>
                    <NavLink
                      item={item}
                      active={
                        pathname === item.href ||
                        pathname.startsWith(item.href + "/")
                      }
                      collapsed={collapsed}
                      onNavigate={onNavigate}
                    />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div
        className={cn(
          "border-t border-border px-3 py-3",
          collapsed && "px-0 text-center",
        )}
      >
        {!collapsed ? (
          <div className="px-1 text-[11px] text-muted-foreground/70">
            AURA · v1.0 · Philippines
          </div>
        ) : (
          <div className="text-[10px] text-muted-foreground/70">v1.0</div>
        )}
      </div>
    </div>
  );
}

/** Desktop sidebar with collapse toggle. */
export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle = useUIStore((s) => s.toggleSidebar);

  return (
    <aside
      className={cn(
        "relative hidden shrink-0 border-r border-border bg-surface transition-[width] duration-200 md:flex md:flex-col",
        collapsed ? "w-[68px]" : "w-64",
      )}
    >
      <SidebarContent collapsed={collapsed} />
      <button
        onClick={toggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute -right-3 top-16 z-10 hidden h-6 w-6 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground shadow-sm transition-colors hover:text-foreground focus-visible:outline-none md:flex"
      >
        {collapsed ? (
          <PanelLeft className="h-3.5 w-3.5" />
        ) : (
          <PanelLeftClose className="h-3.5 w-3.5" />
        )}
      </button>
    </aside>
  );
}
