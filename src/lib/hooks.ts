"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** True once the component has mounted on the client (avoids hydration flashes). */
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/** Track a media query with SSR-safe defaults. */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/**
 * Register a keyboard shortcut. `combo` examples: "mod+k", "escape", "mod+shift+p".
 * "mod" maps to ⌘ on macOS and Ctrl elsewhere.
 */
export function useHotkey(
  combo: string,
  handler: (e: KeyboardEvent) => void,
  options: { enabled?: boolean } = {},
) {
  const { enabled = true } = options;
  const savedHandler = useRef(handler);
  savedHandler.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const parts = combo.toLowerCase().split("+");
    const needMod = parts.includes("mod");
    const needShift = parts.includes("shift");
    const needAlt = parts.includes("alt");
    const key = parts[parts.length - 1];

    const onKeyDown = (e: KeyboardEvent) => {
      const modActive = e.metaKey || e.ctrlKey;
      if (needMod && !modActive) return;
      if (!needMod && modActive && key !== "escape") return;
      if (needShift !== e.shiftKey) return;
      if (needAlt !== e.altKey) return;
      if (e.key.toLowerCase() !== key) return;
      savedHandler.current(e);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [combo, enabled]);
}

/** Call `handler` when a click lands outside the referenced element. */
export function useOutsideClick<T extends HTMLElement>(
  handler: () => void,
  enabled = true,
) {
  const ref = useRef<T>(null);
  const cb = useCallback(handler, [handler]);
  useEffect(() => {
    if (!enabled) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cb();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [cb, enabled]);
  return ref;
}
