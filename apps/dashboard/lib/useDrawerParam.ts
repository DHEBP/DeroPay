"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Canonical drawer-target shape. `entityId` meaning:
 *  - invoice  → invoice id
 *  - escrow   → `scid ?? local_id` (per Wave 1A notes)
 *  - customer → customer profile id
 */
export type DrawerEntityType = "invoice" | "escrow" | "customer";

export type DrawerTarget = {
  entityType: DrawerEntityType;
  entityId: string;
  tab?: string;
} | null;

const ENTITY_TYPES: ReadonlySet<DrawerEntityType> = new Set([
  "invoice",
  "escrow",
  "customer",
]);

function isEntityType(v: string): v is DrawerEntityType {
  return ENTITY_TYPES.has(v as DrawerEntityType);
}

/**
 * URL-state binding for detail drawers.
 *
 * Grammar:
 *   ?drawer=<entityType>:<entityId>
 *   &tab=<tabName>            (optional — focus a specific drawer tab)
 *
 * - Reading is reactive via `useSearchParams()`.
 * - Writing uses `router.replace()` so drawer open/close doesn't pollute
 *   history. `scroll: false` keeps scroll position stable.
 * - `closeDrawer()` clears both `drawer` and `tab` atomically.
 * - Invalid drawer values (unknown entity type, missing id) parse as
 *   `null` — the caller treats this as "no drawer open" and ignores the
 *   param so bad links don't crash the page.
 */
export function useDrawerParam(): {
  target: DrawerTarget;
  openDrawer: (t: DrawerTarget) => void;
  closeDrawer: () => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const raw = params.get("drawer");
  const tab = params.get("tab") ?? undefined;
  let target: DrawerTarget = null;
  if (raw) {
    const sep = raw.indexOf(":");
    if (sep > 0 && sep < raw.length - 1) {
      const entityType = raw.slice(0, sep);
      const entityId = raw.slice(sep + 1);
      if (isEntityType(entityType) && entityId) {
        target = { entityType, entityId, tab };
      }
    }
  }

  const openDrawer = useCallback(
    (t: DrawerTarget) => {
      const next = new URLSearchParams(params.toString());
      if (!t) {
        next.delete("drawer");
        next.delete("tab");
      } else {
        next.set("drawer", `${t.entityType}:${t.entityId}`);
        if (t.tab) next.set("tab", t.tab);
        else next.delete("tab");
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, params],
  );

  const closeDrawer = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    next.delete("drawer");
    next.delete("tab");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname, params]);

  return { target, openDrawer, closeDrawer };
}
