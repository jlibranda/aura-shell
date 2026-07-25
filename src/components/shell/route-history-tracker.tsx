"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "aura:nav-depth";

/**
 * Mounted once at the app shell root. Records, per browser tab, how many
 * distinct in-app routes have been visited. BackButton reads this instead
 * of window.history.length: a fresh tab's history already contains an
 * entry (e.g. about:blank) before the app ever renders, so history.length
 * alone can't tell "the user navigated here from elsewhere in AURA" apart
 * from "this tab has no in-app previous page to go back to."
 */
export function RouteHistoryTracker() {
  const pathname = usePathname();
  const lastPathname = useRef<string | null>(null);

  useEffect(() => {
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;
    const depth = Number(window.sessionStorage.getItem(STORAGE_KEY) ?? "0");
    window.sessionStorage.setItem(STORAGE_KEY, String(depth + 1));
  }, [pathname]);

  return null;
}

/** True once this tab has navigated across at least two distinct in-app routes — i.e. there's a real previous AURA page to go back to. */
export function hasInAppNavigationHistory(): boolean {
  if (typeof window === "undefined") return false;
  return Number(window.sessionStorage.getItem(STORAGE_KEY) ?? "0") > 1;
}
