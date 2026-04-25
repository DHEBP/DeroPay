/**
 * Saved Views data model.
 *
 * A SavedView composes a page's filter + sort + group + column state into a
 * named, reusable configuration. Views are persisted to localStorage under a
 * single global store keyed by `pageKey` ("invoices", "escrow", ...). Each
 * page surfaces its own set of built-ins (see SEED_VIEWS in useSavedViews).
 *
 * Storage shape (localStorage):
 *   "deropay.savedviews.v1" → { [pageKey: string]: SavedView[] }
 *
 * URL encoding:
 *   `facetsToParams` serializes facets into URLSearchParams — multi-value
 *   filter entries are joined with "," (CSV). Consumers that expect single
 *   values should split on "," and union-match the first element.
 */

export type SavedViewFacets = {
  /**
   * Filter key → value. A string[] represents a multi-value OR-match (e.g.
   * Unpaid := status IN ["pending","confirming","partial"]). Serialized to
   * CSV in the URL.
   */
  filters?: Record<string, string | string[]>;
  /** Sort column id (page-defined, e.g. "createdAt"). */
  sort?: string;
  /** Sort direction. */
  dir?: "asc" | "desc";
  /**
   * Grouping axis. null or undefined means flat list. Pages interpret the
   * string — invoices understands "status", "customer", "day", "amount-bucket".
   */
  groupBy?: string | null;
  /** Visible column ids. Empty = page default. Reserved for future use. */
  columns?: string[];
};

export type SavedView = {
  /** `sv_<timestampBase36>_<rand>` — collision-resistant, sortable. */
  id: string;
  /** Page scope ("invoices", "escrow", "customers", …). */
  pageKey: string;
  /** Display name shown on the pill. */
  name: string;
  facets: SavedViewFacets;
  /**
   * Pre-seeded built-ins. Built-ins live in code (see SEED_VIEWS) and are
   * merged with user-defined views at read time — they never hit
   * localStorage. Rename/delete of a built-in is not allowed.
   */
  builtin?: boolean;
  /** When true, render as a dedicated pill (vs living in the More menu). */
  pinned?: boolean;
  createdAt: number;
};

export const STORAGE_KEY = "deropay.savedviews.v1";

/**
 * Built-in view seeds per page. Built-ins are always pinned and rendered
 * first. The "All" built-in must have empty facets — applying it clears the
 * URL back to the page default.
 */
export const SEED_VIEWS: Record<string, SavedView[]> = {
  invoices: [
    {
      id: "sv_builtin_invoices_all",
      pageKey: "invoices",
      name: "All invoices",
      facets: {},
      builtin: true,
      pinned: true,
      createdAt: 0,
    },
    {
      id: "sv_builtin_invoices_unpaid",
      pageKey: "invoices",
      name: "Unpaid",
      // Multi-value: the page maps the CSV to an OR-match at filter time.
      facets: {
        filters: { status: ["pending", "confirming", "partial"] },
      },
      builtin: true,
      pinned: true,
      createdAt: 0,
    },
    {
      id: "sv_builtin_invoices_completed",
      pageKey: "invoices",
      name: "Completed",
      facets: {
        filters: { status: "completed" },
        // `completedAt` isn't in InvoiceSortKey today, but the page falls
        // back to createdAt on unknown sort — we still stash intent for
        // future column support. createdAt desc is a reasonable visible
        // approximation.
        sort: "createdAt",
        dir: "desc",
      },
      builtin: true,
      pinned: true,
      createdAt: 0,
    },
    {
      id: "sv_builtin_invoices_expired",
      pageKey: "invoices",
      name: "Expired",
      facets: { filters: { status: "expired" } },
      builtin: true,
      pinned: true,
      createdAt: 0,
    },
    {
      id: "sv_builtin_invoices_byday",
      pageKey: "invoices",
      name: "By day",
      facets: { groupBy: "day", sort: "createdAt", dir: "desc" },
      builtin: true,
      pinned: true,
      createdAt: 0,
    },
    {
      id: "sv_builtin_invoices_bystatus",
      pageKey: "invoices",
      name: "By status",
      facets: { groupBy: "status" },
      builtin: true,
      pinned: true,
      createdAt: 0,
    },
  ],
};

type Store = Record<string, SavedView[]>;

export function loadStore(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    // Light validation: trust the shape but drop entries that don't look
    // like SavedView (missing id/name) so a corrupt entry doesn't poison
    // the whole page.
    const out: Store = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(v)) continue;
      out[k] = v.filter(
        (x): x is SavedView =>
          !!x &&
          typeof x === "object" &&
          typeof (x as SavedView).id === "string" &&
          typeof (x as SavedView).name === "string" &&
          typeof (x as SavedView).pageKey === "string",
      );
    }
    return out;
  } catch {
    return {};
  }
}

export function saveStore(store: Store): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage quota or private-mode — silent fail. Views revert to
    // built-ins on next load.
  }
}

export function newViewId(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `sv_${t}_${r}`;
}

/**
 * Facets → URLSearchParams. Multi-value filter entries are joined with ",".
 * Reserved keys: `sort`, `dir`, `groupBy`, `columns` — everything else lives
 * under the `filters` bag. Existing params on the page that aren't part of
 * the facet model (e.g. `drawer`, `q`) are NOT touched by this function —
 * the caller merges them in.
 */
export function facetsToParams(facets: SavedViewFacets): URLSearchParams {
  const p = new URLSearchParams();
  if (facets.filters) {
    for (const [k, v] of Object.entries(facets.filters)) {
      const s = Array.isArray(v) ? v.join(",") : v;
      if (s) p.set(k, s);
    }
  }
  if (facets.sort) p.set("sort", facets.sort);
  if (facets.dir) p.set("dir", facets.dir);
  if (facets.groupBy) p.set("groupBy", facets.groupBy);
  if (facets.columns && facets.columns.length > 0) {
    p.set("columns", facets.columns.join(","));
  }
  return p;
}

/**
 * URLSearchParams → facets. The caller must declare which params belong in
 * the filter bag via `filterKeys` — other known params (drawer, q) are left
 * out so they don't fight with the page's dedicated hooks.
 *
 * Note: `q` (search) IS a filter-bag param for invoices (see useSavedViews
 * seeding — we explicitly include "q" in filterKeys).
 */
export function paramsToFacets(
  params: URLSearchParams,
  filterKeys: ReadonlyArray<string>,
): SavedViewFacets {
  const facets: SavedViewFacets = {};
  const filters: Record<string, string | string[]> = {};
  for (const k of filterKeys) {
    const v = params.get(k);
    if (v === null || v === "") continue;
    if (v.includes(",")) {
      filters[k] = v.split(",").filter(Boolean);
    } else {
      filters[k] = v;
    }
  }
  if (Object.keys(filters).length > 0) facets.filters = filters;

  const sort = params.get("sort");
  if (sort) facets.sort = sort;
  const dir = params.get("dir");
  if (dir === "asc" || dir === "desc") facets.dir = dir;
  const groupBy = params.get("groupBy");
  if (groupBy) facets.groupBy = groupBy;
  const columns = params.get("columns");
  if (columns) facets.columns = columns.split(",").filter(Boolean);

  return facets;
}

/** Deep-equal comparison of two facet bags. Order-insensitive for arrays. */
export function facetsEqual(a: SavedViewFacets, b: SavedViewFacets): boolean {
  if ((a.sort ?? "") !== (b.sort ?? "")) return false;
  if ((a.dir ?? "") !== (b.dir ?? "")) return false;
  if ((a.groupBy ?? "") !== (b.groupBy ?? "")) return false;
  const aCols = a.columns ?? [];
  const bCols = b.columns ?? [];
  if (aCols.length !== bCols.length) return false;
  const aColsSorted = [...aCols].sort();
  const bColsSorted = [...bCols].sort();
  for (let i = 0; i < aColsSorted.length; i++) {
    if (aColsSorted[i] !== bColsSorted[i]) return false;
  }
  const aFilters = a.filters ?? {};
  const bFilters = b.filters ?? {};
  const aKeys = Object.keys(aFilters).sort();
  const bKeys = Object.keys(bFilters).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i++) {
    if (aKeys[i] !== bKeys[i]) return false;
    const av = aFilters[aKeys[i]!]!;
    const bv = bFilters[bKeys[i]!]!;
    const aStr = Array.isArray(av) ? [...av].sort().join(",") : av;
    const bStr = Array.isArray(bv) ? [...bv].sort().join(",") : bv;
    if (aStr !== bStr) return false;
  }
  return true;
}
