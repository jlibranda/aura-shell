"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  parseQuery,
  serializeQuery,
  defaultQuery,
} from "@/lib/people/directory-query";
import type { DirectoryQuery } from "@/lib/people/people-types";

/**
 * Binds the directory query to the URL. Reading returns the parsed query from
 * the current search params; writing pushes a new URL (shareable, refresh-safe).
 * Any change that alters results resets the page to 1 unless page itself moved.
 */
export function useDirectoryQuery() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const query = useMemo<DirectoryQuery>(
    () => parseQuery(searchParams),
    [searchParams],
  );

  const commit = useCallback(
    (next: DirectoryQuery) => {
      const params = serializeQuery(next);
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const update = useCallback(
    (patch: Partial<DirectoryQuery>, opts: { resetPage?: boolean } = {}) => {
      const resetPage = opts.resetPage ?? !("page" in patch);
      commit({ ...query, ...patch, ...(resetPage ? { page: 1 } : {}) });
    },
    [commit, query],
  );

  const replaceQuery = useCallback(
    (next: Partial<DirectoryQuery>) => {
      commit({ ...defaultQuery(), ...next });
    },
    [commit],
  );

  const reset = useCallback(() => {
    router.push(pathname, { scroll: false });
  }, [pathname, router]);

  return { query, update, replaceQuery, reset };
}