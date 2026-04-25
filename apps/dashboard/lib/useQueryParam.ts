"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

type Setter = (next: string) => void;

/**
 * Bind a piece of UI state to a single URL search param.
 *
 * - Reading is reactive: browser back/forward or <Link> navigation that
 *   changes the param value re-renders consumers via Next.js's
 *   `useSearchParams()`.
 * - Writing uses `router.replace()` so transient UI changes (filter
 *   clicks, keystrokes) do not pollute history. `scroll: false` keeps
 *   the scroll position stable.
 * - If `next` equals `defaultValue` (or is empty and no default set),
 *   the param is removed from the URL — keeps deep-links tidy.
 *
 * Trade-offs:
 * - One param per hook call. If you need to set several atomically (to
 *   avoid intermediate URL frames in fast sequence), write a bespoke
 *   multi-param setter that builds one URLSearchParams.
 * - On route transitions the hook re-initialises; parent pages hold no
 *   state across navigations — which is the point.
 */
export function useQueryParam(
  key: string,
  defaultValue = "",
): [string, Setter] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const value = searchParams.get(key) ?? defaultValue;

  const setValue = useCallback<Setter>(
    (next) => {
      const params = new URLSearchParams(searchParams.toString());
      if (!next || next === defaultValue) {
        params.delete(key);
      } else {
        params.set(key, next);
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, pathname, searchParams, key, defaultValue],
  );

  return [value, setValue];
}
