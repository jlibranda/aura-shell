import Link from "next/link";
import { Eye, X } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";

export const RUNTIME_DIRECTORY_ROW_ACTIONS = [
  { key: "view-profile", label: "View profile", permission: "people.read" },
] as const;

export function RuntimeDirectoryRowActions({ employeeId }: { employeeId: string }) {
  return <Link href={`/people/${employeeId}`} aria-label="View profile" className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground outline-none hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"><Eye className="h-4 w-4" /><span className="hidden sm:inline">View profile</span></Link>;
}

export function RuntimeDirectoryBulkToolbar({ selectedCount, onClear }: { selectedCount: number; onClear: () => void }) {
  if (selectedCount === 0) return null;
  return <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4" role="status"><div className="flex items-center gap-3 rounded-xl border border-border bg-surface/95 p-2 pl-3 shadow-overlay backdrop-blur-md"><span className="tabular rounded-md bg-primary/10 px-2.5 py-1 text-sm font-medium text-primary">{selectedCount} selected</span><span className="hidden text-sm text-muted-foreground sm:inline">Bulk actions coming in a future release.</span><Button variant="ghost" size="sm" onClick={onClear}>Clear selection</Button><IconButton label="Clear selection" onClick={onClear} className="sm:hidden"><X className="h-4 w-4" /></IconButton></div></div>;
}
