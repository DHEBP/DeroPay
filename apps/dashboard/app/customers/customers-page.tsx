"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  BarChart2,
  AlertOctagon,
  Plus,
  Search,
  Calendar,
  UserPlus,
  Edit2,
  Trash2,
  Tag as TagIcon,
  ArrowRight,
  X,
  MoreVertical,
  UsersRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/components/toast";
import { CohortHeatmap, type CohortData } from "@/components/cohort-heatmap";
import { DisputesTab } from "@/components/disputes-tab";
import {
  CustomerDetailDrawer,
  type CustomerDetail,
} from "@/components/customers/CustomerDetailDrawer";
import { useDrawerParam } from "@/lib/useDrawerParam";
import { formatDero, formatDate, truncate } from "@/lib/format";
import { useInitialTestMode } from "@/lib/test-mode-context";
import type { CustomerProfile, CustomerGroup } from "@/lib/commerce-types";
import {
  AddToGroupPopover,
  CustomerGroupsModal,
  customerGroupColor,
} from "@/components/customers/CustomerGroupsModal";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

type TabId = "overview" | "directory" | "cohorts" | "disputes";

const TAB_IDS: TabId[] = ["overview", "directory", "cohorts", "disputes"];

type Range = "7d" | "30d" | "90d" | "all";

type CustomerRow = {
  customerEmail: string | null;
  customerId: string | null;
  invoiceCount: number;
  /** atomic units as string (bigint-safe) */
  totalPaidAtomic: string;
  lastPaymentAt: string | null;
  // Phase 11 extensions (optional — present when gateway merges profile fields)
  name?: string | null;
  company?: string | null;
  tags?: string[] | null;
};

type CustomersResponse = {
  customers: CustomerRow[];
  total: number;
};

type CohortsResponse = {
  cohorts: CohortData[];
};

const RANGES: Array<{ id: Range; label: string }> = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "all", label: "All time" },
];

// ---------------------------------------------------------------------------
// Demo fixtures
// ---------------------------------------------------------------------------

const DEMO_CUSTOMERS: CustomerRow[] = [
  {
    customerEmail: "ada@lovelace.dev",
    customerId: "cus_ada",
    invoiceCount: 7,
    totalPaidAtomic: "6250000",
    lastPaymentAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
    name: "Ada Lovelace",
    company: "Analytical Engines Ltd",
    tags: ["vip", "enterprise"],
  },
  {
    customerEmail: "grace@hopper.io",
    customerId: "cus_grace",
    invoiceCount: 4,
    totalPaidAtomic: "2100000",
    lastPaymentAt: new Date(Date.now() - 26 * 3600_000).toISOString(),
    name: "Grace Hopper",
    company: "COBOL Systems",
    tags: ["enterprise"],
  },
  {
    customerEmail: "linus@kernel.org",
    customerId: null,
    invoiceCount: 3,
    totalPaidAtomic: "1350000",
    lastPaymentAt: new Date(Date.now() - 4 * 24 * 3600_000).toISOString(),
    name: null,
    company: null,
    tags: ["new"],
  },
  {
    customerEmail: null,
    customerId: "cus_anon_8821",
    invoiceCount: 2,
    totalPaidAtomic: "480000",
    lastPaymentAt: new Date(Date.now() - 9 * 24 * 3600_000).toISOString(),
  },
  {
    customerEmail: "edsger@eat-sleep-code.nl",
    customerId: "cus_ewd",
    invoiceCount: 1,
    totalPaidAtomic: "125000",
    lastPaymentAt: new Date(Date.now() - 21 * 24 * 3600_000).toISOString(),
  },
];

const DEMO_PROFILES: CustomerProfile[] = [
  {
    id: "cp_demo_01",
    email: "ada@lovelace.dev",
    customerId: "cus_ada",
    name: "Ada Lovelace",
    company: "Analytical Engines Ltd",
    phone: "+44 20 7946 0001",
    tags: ["vip", "enterprise"],
    notes: "First merchant on the Analytical Engine plan — renewals are annual.",
    createdAt: Date.now() - 120 * 86_400_000,
    updatedAt: Date.now() - 3 * 86_400_000,
  },
  {
    id: "cp_demo_02",
    email: "grace@hopper.io",
    customerId: "cus_grace",
    name: "Grace Hopper",
    company: "COBOL Systems",
    phone: null,
    tags: ["enterprise", "quarterly"],
    notes: "Quarterly invoicing cadence — prefers email-only communication.",
    createdAt: Date.now() - 80 * 86_400_000,
    updatedAt: Date.now() - 7 * 86_400_000,
  },
  {
    id: "cp_demo_03",
    email: "linus@kernel.org",
    customerId: null,
    name: "Linus Torvalds",
    company: null,
    phone: null,
    tags: ["new", "oss"],
    notes: "OSS contributor — comped invoices only.",
    createdAt: Date.now() - 30 * 86_400_000,
    updatedAt: Date.now() - 30 * 86_400_000,
  },
  {
    id: "cp_demo_04",
    email: "edsger@eat-sleep-code.nl",
    customerId: "cus_ewd",
    name: "Edsger Dijkstra",
    company: "Shortest Path Inc",
    phone: "+31 20 555 0127",
    tags: ["vip"],
    notes: null,
    createdAt: Date.now() - 200 * 86_400_000,
    updatedAt: Date.now() - 40 * 86_400_000,
  },
];

/** Synthesize 6 cohort months with plausible retention decay. */
function makeDemoCohorts(): CohortData[] {
  const now = new Date();
  const months: CohortData[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const cohortMonth = `${yyyy}-${mm}`;
    const width = i + 1; // oldest has more retention columns
    const base = 28 + Math.floor(Math.random() * 40);
    const retention: number[] = [];
    for (let k = 0; k < width; k++) {
      if (k === 0) retention.push(1);
      else {
        const decay = 0.88 - k * 0.11 - Math.random() * 0.06;
        retention.push(Math.max(0, Number(decay.toFixed(4))));
      }
    }
    months.push({ cohortMonth, customerCount: base, retention });
  }
  return months;
}

const DEMO_COHORTS = makeDemoCohorts();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ApiError = { error?: { code?: string; message?: string } | string };

function extractError(body: ApiError | null, fallback: string): string {
  if (!body) return fallback;
  if (typeof body.error === "string") return body.error;
  if (body.error && typeof body.error === "object" && body.error.message) {
    return body.error.message;
  }
  return fallback;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let body: ApiError | null = null;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      /* no body */
    }
    throw new Error(extractError(body, `Request failed (${res.status})`));
  }
  return (await res.json()) as T;
}

function filterDemoCustomers(
  all: CustomerRow[],
  range: Range,
  search: string
): CustomerRow[] {
  const now = Date.now();
  const windowDays =
    range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : null;

  let rows = all;
  if (windowDays !== null) {
    const cutoff = now - windowDays * 24 * 3600_000;
    rows = rows.filter((r) => {
      if (!r.lastPaymentAt) return false;
      return new Date(r.lastPaymentAt).getTime() >= cutoff;
    });
  }

  const q = search.trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) => {
      const email = r.customerEmail?.toLowerCase() ?? "";
      const id = r.customerId?.toLowerCase() ?? "";
      const name = r.name?.toLowerCase() ?? "";
      const company = r.company?.toLowerCase() ?? "";
      return (
        email.includes(q) ||
        id.includes(q) ||
        name.includes(q) ||
        company.includes(q)
      );
    });
  }

  return rows;
}

function parseHashTab(hash: string): TabId {
  const v = hash.replace(/^#/, "") as TabId;
  return (TAB_IDS as string[]).includes(v) ? v : "overview";
}

// ===========================================================================
// Root page
// ===========================================================================

export function CustomersPage() {
  const [tab, setTab] = useState<TabId>("overview");
  const [directoryPrefill, setDirectoryPrefill] = useState<string>("");

  // The customer drawer lives inside the Directory tab. If a deep link
  // (?drawer=customer:<id>) lands while a different tab is active,
  // auto-switch so the drawer actually renders.
  const { target: drawerTarget } = useDrawerParam();

  // URL hash sync — load initial + listen for changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    setTab(parseHashTab(window.location.hash));
    const onHash = () => setTab(parseHashTab(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const goTab = useCallback((t: TabId) => {
    setTab(t);
    if (typeof window !== "undefined") {
      const next = `#${t}`;
      if (window.location.hash !== next) {
        // Using history to avoid scroll jump
        window.history.replaceState(null, "", next);
      }
    }
  }, []);

  // Auto-switch to Directory when a customer drawer link lands. Runs
  // after the hash-sync effect so a user-chosen tab isn't overridden on
  // subsequent renders (drawerTarget stays stable per URL).
  useEffect(() => {
    if (drawerTarget?.entityType === "customer" && tab !== "directory") {
      goTab("directory");
    }
  }, [drawerTarget, tab, goTab]);

  const jumpToDirectory = useCallback(
    (q: string) => {
      setDirectoryPrefill(q);
      goTab("directory");
    },
    [goTab]
  );

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Who paid you, how often, and how much."
      />

      <Tabs
        current={tab}
        onChange={goTab}
        items={[
          { id: "overview", label: "Overview", Icon: Users },
          { id: "directory", label: "Directory", Icon: UserPlus },
          { id: "cohorts", label: "Cohorts", Icon: BarChart2 },
          { id: "disputes", label: "Disputes", Icon: AlertOctagon },
        ]}
      />

      <div style={{ marginTop: 18 }}>
        {tab === "overview" && <OverviewTab onOpenProfile={jumpToDirectory} />}
        {tab === "directory" && (
          <DirectoryTab
            initialSearch={directoryPrefill}
            onConsumedPrefill={() => setDirectoryPrefill("")}
          />
        )}
        {tab === "cohorts" && <CohortsTab />}
        {tab === "disputes" && <DisputesTab />}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tab bar (mirrors credits-page)
// ---------------------------------------------------------------------------

function Tabs({
  current,
  onChange,
  items,
}: {
  current: TabId;
  onChange: (t: TabId) => void;
  items: Array<{ id: TabId; label: string; Icon: typeof Users }>;
}) {
  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: 4,
        borderBottom: "1px solid var(--ink-hair)",
        padding: "0 2px",
      }}
    >
      {items.map(({ id, label, Icon }) => {
        const active = id === current;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              background: "transparent",
              border: "none",
              borderBottom: `2px solid ${active ? "var(--dero)" : "transparent"}`,
              color: active ? "var(--bone)" : "var(--bone-quiet)",
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              fontWeight: active ? 500 : 400,
              cursor: "pointer",
              marginBottom: -1,
              transition: "color 0.15s var(--ease-out)",
            }}
          >
            <Icon size={13} strokeWidth={2} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ===========================================================================
// TAB 1 · Overview (preserves EXISTING behavior verbatim)
// ===========================================================================

function OverviewTab({
  onOpenProfile,
}: {
  onOpenProfile: (query: string) => void;
}) {
  const isDemo = useInitialTestMode();
  const router = useRouter();
  const [range, setRange] = useState<Range>("all");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input (~300ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  // Data fetch — mirrors invoices-page.tsx idiom
  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      if (isDemo) {
        setCustomers(filterDemoCustomers(DEMO_CUSTOMERS, range, debouncedSearch));
        return;
      }

      const params = new URLSearchParams({ range });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const response = await fetch(`/api/pay/customers?${params.toString()}`);
      if (response.ok) {
        const body = (await response.json()) as CustomersResponse;
        setCustomers(Array.isArray(body?.customers) ? body.customers : []);
      } else {
        setCustomers([]);
      }
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [range, debouncedSearch]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const hasResults = customers.length > 0;
  const tableRows = useMemo(() => customers, [customers]);

  return (
    <>
      <SectionHeader
        title="Recent activity"
        subtitle="Payors aggregated from completed invoices, ranked by volume. Click a row to jump to their profile in the Directory tab."
        action={
          <button
            type="button"
            className="btn btn-primary btn-mini"
            onClick={() => router.push("/invoices?new=1")}
          >
            <Plus size={12} /> New invoice
          </button>
        }
      />

      {/* Controls: range + search */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 14,
          padding: "0 2px",
          flexWrap: "wrap",
        }}
      >
        <span
          className="eyebrow"
          style={{
            marginRight: 6,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "var(--bone-quiet)",
          }}
        >
          <Calendar size={12} /> Range
        </span>
        {RANGES.map((r) => {
          const active = r.id === range;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              style={{
                padding: "5px 11px",
                borderRadius: 999,
                border: `1px solid ${active ? "var(--dero)" : "var(--ink-hair)"}`,
                background: active ? "var(--dero-wash)" : "transparent",
                color: active ? "var(--dero)" : "var(--bone-dim)",
                fontFamily: "var(--font-mono)",
                fontSize: 10.5,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                cursor: "pointer",
                transition: "all 0.15s var(--ease-out)",
              }}
            >
              {r.label}
            </button>
          );
        })}

        <div style={{ flex: 1, minWidth: 140 }} />

        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 10px",
            borderRadius: 999,
            border: "1px solid var(--ink-hair)",
            background: "var(--ink-elev-1)",
            minWidth: 220,
          }}
        >
          <Search size={12} color="var(--bone-quiet)" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search email, id, name, company"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--bone)",
              fontSize: 12.5,
              fontFamily: "var(--font-sans)",
            }}
          />
        </div>
      </div>

      {/* Data region */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.08 }}
      >
        {loading ? (
          <LoadingCard label="Loading customers…" />
        ) : !hasResults ? (
          <EmptyState
            icon={<Users size={22} strokeWidth={1.6} />}
            title="No customers yet"
            description={
              debouncedSearch
                ? `No customers match "${debouncedSearch}". Try a different query.`
                : "No customers yet — create an invoice to see customers appear."
            }
            action={
              !debouncedSearch ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => router.push("/invoices?new=1")}
                  style={{ padding: "9px 16px", fontSize: 13 }}
                >
                  <Plus size={14} strokeWidth={2.2} /> Create invoice
                </button>
              ) : null
            }
          />
        ) : (
          <div className="surface" style={{ padding: 0 }}>
            <CustomerTable rows={tableRows} onOpenProfile={onOpenProfile} />
          </div>
        )}
      </motion.div>
    </>
  );
}

function CustomerTable({
  rows,
  onOpenProfile,
}: {
  rows: CustomerRow[];
  onOpenProfile: (query: string) => void;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table>
        <thead>
          <tr>
            <th>Customer</th>
            <th>Tags</th>
            <th style={{ textAlign: "right" }}>Invoices</th>
            <th style={{ textAlign: "right" }}>Total Paid</th>
            <th>Last Payment</th>
            <th style={{ textAlign: "right" }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const label =
              r.name ??
              r.customerEmail ??
              (r.customerId ? truncate(r.customerId, 8, 4) : "—");
            const secondary =
              r.name && r.customerEmail
                ? r.customerEmail
                : r.customerEmail && r.customerId
                  ? truncate(r.customerId, 8, 4)
                  : null;
            const key = `${r.customerEmail ?? ""}|${r.customerId ?? ""}|${i}`;
            const profileQuery =
              r.customerEmail ?? r.customerId ?? r.name ?? "";
            return (
              <tr key={key}>
                <td style={{ maxWidth: 320 }}>
                  <div style={{ color: "var(--bone)" }}>{label}</div>
                  {secondary && (
                    <div
                      className="mono"
                      style={{
                        fontSize: 10.5,
                        color: "var(--bone-quiet)",
                      }}
                    >
                      {secondary}
                    </div>
                  )}
                  {r.company && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--bone-quiet)",
                        marginTop: 2,
                      }}
                    >
                      {r.company}
                    </div>
                  )}
                </td>
                <td>
                  <TagChips tags={r.tags ?? []} />
                </td>
                <td
                  className="num"
                  style={{ textAlign: "right", color: "var(--bone-dim)" }}
                >
                  {r.invoiceCount}
                </td>
                <td
                  className="num"
                  style={{ textAlign: "right", color: "var(--bone)" }}
                >
                  {formatDero(r.totalPaidAtomic, 5)}{" "}
                  <span
                    style={{
                      color: "var(--bone-quiet)",
                      fontSize: 9.5,
                      letterSpacing: "0.14em",
                    }}
                  >
                    DERO
                  </span>
                </td>
                <td
                  className="mono"
                  style={{ fontSize: 11, color: "var(--bone-dim)" }}
                >
                  {r.lastPaymentAt ? formatDate(r.lastPaymentAt) : "—"}
                </td>
                <td style={{ textAlign: "right" }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-mini"
                    onClick={() => onOpenProfile(profileQuery)}
                    disabled={!profileQuery}
                    title="Open profile in Directory"
                  >
                    Open profile <ArrowRight size={11} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ===========================================================================
// TAB 2 · Directory
// ===========================================================================

type ProfilePayload = {
  email?: string;
  customerId?: string;
  name?: string;
  company?: string;
  phone?: string;
  tags?: string[];
  notes?: string;
};

function DirectoryTab({
  initialSearch,
  onConsumedPrefill,
}: {
  initialSearch: string;
  onConsumedPrefill: () => void;
}) {
  const isDemo = useInitialTestMode();
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<CustomerProfile[]>(
    isDemo ? DEMO_PROFILES : []
  );
  const [loading, setLoading] = useState(!isDemo);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [tagFilter, setTagFilter] = useState<string>("all");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modal state
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<CustomerProfile | null>(null);
  const [deleting, setDeleting] = useState<CustomerProfile | null>(null);

  // Groups state (Phase 2 #16)
  const [allGroups, setAllGroups] = useState<CustomerGroup[]>([]);
  const [membership, setMembership] = useState<Map<string, CustomerGroup[]>>(
    new Map()
  );
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [showGroupsModal, setShowGroupsModal] = useState(false);
  const [groupPopover, setGroupPopover] = useState<{
    customerId: string;
    anchorRect: DOMRect | null;
  } | null>(null);

  // Read ?group=<id> from URL on mount and react to it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const read = () => {
      const params = new URLSearchParams(window.location.search);
      setGroupFilter(params.get("group"));
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const updateGroupQueryParam = useCallback((id: string | null) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("group", id);
    else url.searchParams.delete("group");
    window.history.replaceState(null, "", url.toString());
    setGroupFilter(id);
  }, []);

  // Drawer state — bound to `?drawer=customer:<id>` for deep-linkable
  // detail views (shared grammar across list pages, see useDrawerParam).
  // Cross-entity drawer values on this page are ignored.
  const { target: drawerTarget, openDrawer, closeDrawer } = useDrawerParam();
  const openId =
    drawerTarget && drawerTarget.entityType === "customer"
      ? drawerTarget.entityId
      : "";
  const setOpenRowId = useCallback(
    (id: string) => openDrawer({ entityType: "customer", entityId: id }),
    [openDrawer],
  );

  // Apply the one-time prefill, then clear it in the parent
  useEffect(() => {
    if (initialSearch) {
      setSearchInput(initialSearch);
      setDebouncedSearch(initialSearch);
      onConsumedPrefill();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSearch]);

  // Debounce search input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  const fetchProfiles = useCallback(async () => {
    if (isDemo) {
      setProfiles(DEMO_PROFILES);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (tagFilter && tagFilter !== "all") params.set("tag", tagFilter);
      params.set("limit", "100");
      const data = await apiFetch<{ profiles: CustomerProfile[] }>(
        `/api/pay/customers/profiles?${params.toString()}`
      );
      setProfiles(data.profiles ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load profiles"
      );
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, tagFilter]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  // Load groups + per-customer membership. Refetches whenever the profiles
  // list changes so newly-created profiles pick up their groups, and whenever
  // the groups modal closes (so deletes/renames propagate without a hard
  // reload).
  const fetchGroupData = useCallback(async () => {
    try {
      const { groups } = await apiFetch<{ groups: CustomerGroup[] }>(
        "/api/pay/customer-groups?withMembers=1"
      );
      setAllGroups(groups ?? []);
    } catch {
      // Silent — groups are a progressive-enhancement overlay on the
      // directory. Keep the page usable if the endpoint is unreachable.
      setAllGroups([]);
    }
  }, []);

  useEffect(() => {
    fetchGroupData();
  }, [fetchGroupData]);

  useEffect(() => {
    // Fetch membership in parallel for the visible profile set.
    if (profiles.length === 0) {
      setMembership(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        profiles.map(async (p) => {
          try {
            const { groups } = await apiFetch<{ groups: CustomerGroup[] }>(
              `/api/pay/customers/${encodeURIComponent(p.id)}/groups`
            );
            return [p.id, groups ?? []] as const;
          } catch {
            return [p.id, [] as CustomerGroup[]] as const;
          }
        })
      );
      if (cancelled) return;
      setMembership(new Map(results));
    })();
    return () => {
      cancelled = true;
    };
  }, [profiles]);

  // Client-side filters for demo mode (server handles search/tag in live mode).
  // Group-filter is applied in BOTH modes because the server-side list
  // endpoint doesn't accept a group filter — Phase 2 #16 intentionally keeps
  // the filter client-side to avoid a new gateway param this early.
  const filtered = useMemo(() => {
    let rows = profiles;
    if (isDemo) {
      const q = debouncedSearch.trim().toLowerCase();
      if (q) {
        rows = rows.filter((p) => {
          return (
            (p.email ?? "").toLowerCase().includes(q) ||
            (p.customerId ?? "").toLowerCase().includes(q) ||
            (p.name ?? "").toLowerCase().includes(q) ||
            (p.company ?? "").toLowerCase().includes(q)
          );
        });
      }
      if (tagFilter !== "all") {
        rows = rows.filter((p) => (p.tags ?? []).includes(tagFilter));
      }
    }
    if (groupFilter) {
      rows = rows.filter((p) =>
        (membership.get(p.id) ?? []).some((g) => g.id === groupFilter)
      );
    }
    return rows;
  }, [profiles, debouncedSearch, tagFilter, groupFilter, membership]);

  // Distinct tags from the current result set
  const distinctTags = useMemo(() => {
    const s = new Set<string>();
    for (const p of profiles) for (const t of p.tags ?? []) s.add(t);
    return Array.from(s).sort();
  }, [profiles]);

  // Resolve currently-open profile from URL id; also used for row highlight.
  const openProfile = useMemo<CustomerDetail | null>(() => {
    const p = openId ? profiles.find((x) => x.id === openId) : null;
    if (!p) return null;
    return {
      id: p.id,
      email: p.email ?? null,
      customerId: p.customerId ?? null,
      name: p.name ?? null,
      company: p.company ?? null,
      phone: p.phone ?? null,
      tags: p.tags,
      notes: p.notes ?? null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }, [openId, profiles]);

  const handleCreate = useCallback(
    async (payload: ProfilePayload) => {
      if (isDemo) {
        const profile: CustomerProfile = {
          id: `cp_demo_${Math.random().toString(16).slice(2, 8)}`,
          email: payload.email ?? null,
          customerId: payload.customerId ?? null,
          name: payload.name ?? null,
          company: payload.company ?? null,
          phone: payload.phone ?? null,
          tags: payload.tags ?? [],
          notes: payload.notes ?? null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        setProfiles((prev) => [profile, ...prev]);
        toast({ title: "Profile created", tone: "success" });
        setShowNew(false);
        return;
      }
      try {
        await apiFetch("/api/pay/customers/profiles", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast({ title: "Profile created", tone: "success" });
        setShowNew(false);
        fetchProfiles();
      } catch (err) {
        toast({
          title: "Create failed",
          description: err instanceof Error ? err.message : undefined,
          tone: "error",
        });
      }
    },
    [fetchProfiles, toast]
  );

  const handleUpdate = useCallback(
    async (id: string, payload: ProfilePayload) => {
      if (isDemo) {
        setProfiles((prev) =>
          prev.map((p) =>
            p.id === id
              ? {
                  ...p,
                  email: payload.email ?? null,
                  customerId: payload.customerId ?? null,
                  name: payload.name ?? null,
                  company: payload.company ?? null,
                  phone: payload.phone ?? null,
                  tags: payload.tags ?? [],
                  notes: payload.notes ?? null,
                  updatedAt: Date.now(),
                }
              : p
          )
        );
        toast({ title: "Profile updated", tone: "success" });
        setEditing(null);
        return;
      }
      try {
        await apiFetch(
          `/api/pay/customers/profiles/${encodeURIComponent(id)}`,
          { method: "PUT", body: JSON.stringify(payload) }
        );
        toast({ title: "Profile updated", tone: "success" });
        setEditing(null);
        fetchProfiles();
      } catch (err) {
        toast({
          title: "Update failed",
          description: err instanceof Error ? err.message : undefined,
          tone: "error",
        });
      }
    },
    [fetchProfiles, toast]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (isDemo) {
        setProfiles((prev) => prev.filter((p) => p.id !== id));
        toast({ title: "Profile deleted", tone: "info" });
        setDeleting(null);
        return;
      }
      try {
        await apiFetch(
          `/api/pay/customers/profiles/${encodeURIComponent(id)}`,
          { method: "DELETE" }
        );
        toast({ title: "Profile deleted", tone: "info" });
        setDeleting(null);
        fetchProfiles();
      } catch (err) {
        toast({
          title: "Delete failed",
          description: err instanceof Error ? err.message : undefined,
          tone: "error",
        });
      }
    },
    [fetchProfiles, toast]
  );

  return (
    <>
      <SectionHeader
        title="Customer directory"
        subtitle="First-class merchant records — name, company, contact, tags, and private notes. Merged into the invoice view when emails or customer IDs match."
        action={
          <div style={{ display: "inline-flex", gap: 8 }}>
            <button
              className="btn btn-ghost btn-mini"
              onClick={() => setShowGroupsModal(true)}
              title="Manage customer groups"
            >
              <UsersRound size={12} /> Manage groups
            </button>
            <button
              className="btn btn-primary btn-mini"
              onClick={() => setShowNew(true)}
            >
              <Plus size={12} /> New profile
            </button>
          </div>
        }
      />

      {/* Filters */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 10px",
            borderRadius: 999,
            border: "1px solid var(--ink-hair)",
            background: "var(--ink-elev-1)",
            minWidth: 260,
          }}
        >
          <Search size={12} color="var(--bone-quiet)" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search email, name, company"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--bone)",
              fontSize: 12.5,
              fontFamily: "var(--font-sans)",
            }}
          />
        </div>

        <span
          className="eyebrow"
          style={{
            color: "var(--bone-quiet)",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <TagIcon size={11} /> Tag
        </span>
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          style={{
            padding: "5px 10px",
            background: "var(--ink-elev-1)",
            color: "var(--bone-dim)",
            border: "1px solid var(--ink-hair)",
            borderRadius: "var(--radius-sm)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          <option value="all">All tags</option>
          {distinctTags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        {groupFilter && (
          <GroupFilterChip
            group={allGroups.find((g) => g.id === groupFilter) ?? null}
            onClear={() => updateGroupQueryParam(null)}
          />
        )}

        <div style={{ flex: 1 }} />
        <span
          className="mono"
          style={{ fontSize: 11, color: "var(--bone-quiet)" }}
        >
          {filtered.length} profile{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchProfiles} />}

      {loading ? (
        <LoadingCard label="Loading profiles…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<UserPlus size={22} strokeWidth={1.6} />}
          title={
            profiles.length === 0 ? "No profiles yet" : "No profiles match"
          }
          description={
            profiles.length === 0
              ? "Create a profile to track customer contact info, tags, and notes — independent of invoice history."
              : "Clear filters or try a different search."
          }
          action={
            profiles.length === 0 ? (
              <button
                className="btn btn-primary"
                onClick={() => setShowNew(true)}
                style={{ padding: "9px 16px", fontSize: 13 }}
              >
                <Plus size={14} strokeWidth={2.2} /> New profile
              </button>
            ) : null
          }
        />
      ) : (
        <TableCard>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Email</Th>
                <Th>Customer ID</Th>
                <Th>Name</Th>
                <Th>Company</Th>
                <Th>Tags</Th>
                <Th>Groups</Th>
                <Th>Created</Th>
                <Th align="right" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const isOpen = p.id === openId;
                const openRow = () => setOpenRowId(p.id);
                return (
                <tr
                  key={p.id}
                  aria-selected={isOpen || undefined}
                  onClick={openRow}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openRow();
                    }
                  }}
                  tabIndex={0}
                  style={{
                    background: isOpen ? "var(--ink-elev-2)" : undefined,
                    outline: isOpen
                      ? "1px solid var(--dero-hair)"
                      : undefined,
                    outlineOffset: isOpen ? "-1px" : undefined,
                    cursor: "pointer",
                  }}
                >
                  <Td mono>
                    <span style={{ color: "var(--bone)" }}>
                      {p.email ?? "—"}
                    </span>
                  </Td>
                  <Td mono>
                    <span style={{ color: "var(--bone-dim)", fontSize: 11.5 }}>
                      {p.customerId ? truncate(p.customerId, 10, 4) : "—"}
                    </span>
                  </Td>
                  <Td>
                    <span style={{ color: "var(--bone)" }}>
                      {p.name ?? "—"}
                    </span>
                  </Td>
                  <Td>
                    <span style={{ color: "var(--bone-dim)" }}>
                      {p.company ?? "—"}
                    </span>
                  </Td>
                  <Td>
                    <TagChips tags={p.tags ?? []} />
                  </Td>
                  <Td>
                    <GroupChipsCell
                      groups={membership.get(p.id) ?? []}
                      onChipClick={(id) => updateGroupQueryParam(id)}
                      activeGroupId={groupFilter}
                    />
                  </Td>
                  <Td mono>
                    <span style={{ fontSize: 11, color: "var(--bone-dim)" }}>
                      {formatDate(new Date(p.createdAt).toISOString())}
                    </span>
                  </Td>
                  <Td align="right">
                    <div
                      style={{
                        display: "inline-flex",
                        gap: 6,
                        justifyContent: "flex-end",
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="btn btn-ghost btn-mini"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(p);
                        }}
                        title="Edit profile"
                      >
                        <Edit2 size={11} /> Edit
                      </button>
                      <button
                        className="btn btn-ghost btn-mini"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleting(p);
                        }}
                        title="Delete profile"
                      >
                        <Trash2 size={11} />
                      </button>
                      <button
                        className="btn btn-ghost btn-mini"
                        onClick={(e) => {
                          e.stopPropagation();
                          setGroupPopover({
                            customerId: p.id,
                            anchorRect: (
                              e.currentTarget as HTMLButtonElement
                            ).getBoundingClientRect(),
                          });
                        }}
                        title="Add to group…"
                      >
                        <MoreVertical size={11} />
                      </button>
                    </div>
                  </Td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </TableCard>
      )}

      {/* Modals */}
      <AnimatePresence>
        {showNew && (
          <ProfileModal
            key="new-profile"
            title="New profile"
            onClose={() => setShowNew(false)}
            onSubmit={handleCreate}
          />
        )}
        {editing && (
          <ProfileModal
            key={`edit-${editing.id}`}
            title="Edit profile"
            initial={editing}
            onClose={() => setEditing(null)}
            onSubmit={(payload) => handleUpdate(editing.id, payload)}
          />
        )}
        {deleting && (
          <ConfirmModal
            key={`del-${deleting.id}`}
            title="Delete profile?"
            message={`This will remove the profile for ${
              deleting.email ?? deleting.name ?? deleting.customerId ?? "this customer"
            }. Invoice history is unaffected.`}
            confirmLabel="Delete"
            onCancel={() => setDeleting(null)}
            onConfirm={() => handleDelete(deleting.id)}
          />
        )}
      </AnimatePresence>

      <CustomerDetailDrawer
        customer={openProfile}
        onClose={closeDrawer}
        initialTab={drawerTarget?.tab}
      />

      <CustomerGroupsModal
        open={showGroupsModal}
        onClose={() => setShowGroupsModal(false)}
        onChange={() => {
          // A group may have been renamed / deleted — reload the canonical
          // list AND each visible profile's membership (a deleted group
          // vanishes from chips; a rename flows through the id-keyed map).
          fetchGroupData();
          if (profiles.length > 0) {
            (async () => {
              const results = await Promise.all(
                profiles.map(async (p) => {
                  try {
                    const { groups } = await apiFetch<{ groups: CustomerGroup[] }>(
                      `/api/pay/customers/${encodeURIComponent(p.id)}/groups`
                    );
                    return [p.id, groups ?? []] as const;
                  } catch {
                    return [p.id, [] as CustomerGroup[]] as const;
                  }
                })
              );
              setMembership(new Map(results));
            })();
          }
        }}
      />

      <AnimatePresence>
        {groupPopover && (
          <AddToGroupPopover
            key={`pop-${groupPopover.customerId}`}
            customerId={groupPopover.customerId}
            anchorRect={groupPopover.anchorRect}
            onClose={() => setGroupPopover(null)}
            onApplied={async () => {
              try {
                const { groups } = await apiFetch<{ groups: CustomerGroup[] }>(
                  `/api/pay/customers/${encodeURIComponent(
                    groupPopover.customerId
                  )}/groups`
                );
                setMembership((prev) => {
                  const next = new Map(prev);
                  next.set(groupPopover.customerId, groups ?? []);
                  return next;
                });
                fetchGroupData();
              } catch {
                /* ignore — toast already fired inside the popover */
              }
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------------------
// Profile create/edit modal
// ---------------------------------------------------------------------------

function ProfileModal({
  title,
  initial,
  onClose,
  onSubmit,
}: {
  title: string;
  initial?: CustomerProfile;
  onClose: () => void;
  onSubmit: (payload: ProfilePayload) => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [email, setEmail] = useState(initial?.email ?? "");
  const [customerId, setCustomerId] = useState(initial?.customerId ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [tagsInput, setTagsInput] = useState((initial?.tags ?? []).join(", "));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(async () => {
    const emailTrim = email.trim();
    const idTrim = customerId.trim();
    if (!emailTrim && !idTrim) {
      toast({
        title: "Email or customer ID required",
        tone: "warn",
      });
      return;
    }
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const payload: ProfilePayload = {
      email: emailTrim || undefined,
      customerId: idTrim || undefined,
      name: name.trim() || undefined,
      company: company.trim() || undefined,
      phone: phone.trim() || undefined,
      tags: tags.length ? tags : undefined,
      notes: notes.trim() || undefined,
    };
    setSubmitting(true);
    try {
      await onSubmit(payload);
    } finally {
      setSubmitting(false);
    }
  }, [email, customerId, name, company, phone, tagsInput, notes, onSubmit, toast]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 900,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="surface"
        style={{
          maxWidth: 620,
          width: "100%",
          maxHeight: "85vh",
          overflow: "auto",
          padding: 0,
        }}
      >
        <div
          style={{
            padding: "18px 22px",
            borderBottom: "1px solid var(--ink-hair)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h3
            className="display"
            style={{
              fontSize: 15,
              fontWeight: 600,
              margin: 0,
              color: "var(--bone)",
            }}
          >
            {title}
          </h3>
          <button
            className="btn btn-ghost btn-mini"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={12} />
          </button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="customer@example.com"
                style={inputStyle}
                autoFocus
              />
            </Field>
            <Field label="Customer ID">
              <input
                type="text"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                placeholder="cus_…"
                style={inputStyle}
              />
            </Field>
            <Field label="Name">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ada Lovelace"
                style={inputStyle}
              />
            </Field>
            <Field label="Company">
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Analytical Engines Ltd"
                style={inputStyle}
              />
            </Field>
            <Field label="Phone">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 0100"
                style={inputStyle}
              />
            </Field>
            <Field label="Tags (comma-separated)">
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="vip, enterprise, quarterly"
                style={inputStyle}
              />
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Private notes, visible only to merchant staff."
              rows={4}
              style={{
                ...inputStyle,
                fontFamily: "var(--font-sans)",
                resize: "vertical",
              }}
            />
          </Field>

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button
              className="btn btn-primary btn-mini"
              onClick={submit}
              disabled={submitting}
            >
              {submitting ? "Saving…" : initial ? "Save changes" : "Create profile"}
            </button>
            <button className="btn btn-ghost btn-mini" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Confirm modal
// ---------------------------------------------------------------------------

function ConfirmModal({
  title,
  message,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const confirm = useCallback(async () => {
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  }, [onConfirm]);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 900,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="surface"
        style={{ maxWidth: 440, width: "100%", padding: 22 }}
      >
        <h3
          className="display"
          style={{
            fontSize: 15,
            fontWeight: 600,
            margin: "0 0 8px",
            color: "var(--bone)",
          }}
        >
          {title}
        </h3>
        <p
          style={{
            fontSize: 13,
            color: "var(--bone-dim)",
            lineHeight: 1.55,
            margin: "0 0 16px",
          }}
        >
          {message}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost btn-mini" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn btn-primary btn-mini"
            onClick={confirm}
            disabled={submitting}
          >
            {submitting ? "…" : confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ===========================================================================
// TAB 3 · Cohorts
// ===========================================================================

function CohortsTab() {
  const isDemo = useInitialTestMode();
  const [months, setMonths] = useState<number>(12);
  const [cohorts, setCohorts] = useState<CohortData[]>(
    isDemo ? DEMO_COHORTS : []
  );
  const [loading, setLoading] = useState(!isDemo);
  const [error, setError] = useState<string | null>(null);

  const fetchCohorts = useCallback(async () => {
    if (isDemo) {
      setCohorts(DEMO_COHORTS);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<CohortsResponse>(
        `/api/pay/customers/cohorts?months=${months}`
      );
      setCohorts(data.cohorts ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load cohort data"
      );
      setCohorts([]);
    } finally {
      setLoading(false);
    }
  }, [months]);

  useEffect(() => {
    fetchCohorts();
  }, [fetchCohorts]);

  return (
    <>
      <SectionHeader
        title="Customer cohorts"
        subtitle="Retention by first-payment month. Each row is a cohort; each cell is the share of that cohort who paid at least one invoice that month."
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <span
          className="eyebrow"
          style={{
            color: "var(--bone-quiet)",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Calendar size={11} /> Window
        </span>
        {[6, 12, 24].map((m) => {
          const active = m === months;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setMonths(m)}
              style={{
                padding: "5px 11px",
                borderRadius: 999,
                border: `1px solid ${active ? "var(--dero)" : "var(--ink-hair)"}`,
                background: active ? "var(--dero-wash)" : "transparent",
                color: active ? "var(--dero)" : "var(--bone-dim)",
                fontFamily: "var(--font-mono)",
                fontSize: 10.5,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              {m} months
            </button>
          );
        })}
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchCohorts} />}

      {loading ? (
        <LoadingCard label="Loading cohort data…" />
      ) : (
        <CohortHeatmap cohorts={cohorts} />
      )}
    </>
  );
}

// ===========================================================================
// Shared presentational bits
// ===========================================================================

function GroupChipsCell({
  groups,
  activeGroupId,
  onChipClick,
}: {
  groups: CustomerGroup[];
  activeGroupId: string | null;
  onChipClick: (groupId: string) => void;
}) {
  if (!groups || groups.length === 0) {
    return <span style={{ color: "var(--bone-quiet)", fontSize: 11 }}>—</span>;
  }
  const shown = groups.slice(0, 3);
  const extra = groups.length - shown.length;
  return (
    <div
      style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}
      onClick={(e) => e.stopPropagation()}
    >
      {shown.map((g) => {
        const active = g.id === activeGroupId;
        const color = customerGroupColor(g.color);
        return (
          <button
            key={g.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChipClick(g.id);
            }}
            title={`Filter by "${g.name}"`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "1px 7px 1px 6px",
              borderRadius: 4,
              background: active ? color : "var(--ink-elev-2)",
              border: `1px solid ${active ? color : "var(--ink-hair)"}`,
              color: active ? "var(--ink-deep)" : "var(--bone)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: 2,
                background: active ? "var(--ink-deep)" : color,
                flexShrink: 0,
              }}
            />
            {g.name}
          </button>
        );
      })}
      {extra > 0 && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "1px 6px",
            borderRadius: 4,
            background: "var(--ink-elev-2)",
            border: "1px solid var(--ink-hair)",
            color: "var(--bone-dim)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
          }}
          title={groups
            .slice(3)
            .map((g) => g.name)
            .join(", ")}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

function GroupFilterChip({
  group,
  onClear,
}: {
  group: CustomerGroup | null;
  onClear: () => void;
}) {
  if (!group) {
    return (
      <button
        className="btn btn-ghost btn-mini"
        onClick={onClear}
        title="Clear group filter"
      >
        <X size={11} /> Unknown group
      </button>
    );
  }
  const color = customerGroupColor(group.color);
  return (
    <button
      type="button"
      onClick={onClear}
      title="Clear group filter"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 8px 4px 9px",
        borderRadius: 999,
        background: color,
        color: "var(--ink-deep)",
        fontFamily: "var(--font-mono)",
        fontSize: 10.5,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        border: "none",
        cursor: "pointer",
      }}
    >
      <UsersRound size={11} strokeWidth={2} />
      {group.name}
      <X size={11} strokeWidth={2.2} />
    </button>
  );
}

function TagChips({ tags }: { tags: string[] }) {
  if (!tags || tags.length === 0) {
    return <span style={{ color: "var(--bone-quiet)", fontSize: 11 }}>—</span>;
  }
  return (
    <div style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
      {tags.map((t) => (
        <span
          key={t}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "1px 7px",
            borderRadius: 4,
            background: "var(--ink-elev-2)",
            border: "1px solid var(--ink-hair)",
            color: "var(--bone-dim)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 14,
        marginBottom: 14,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <h3
          className="display"
          style={{
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            margin: 0,
            color: "var(--bone)",
          }}
        >
          {title}
        </h3>
        {subtitle && (
          <p
            style={{
              fontSize: 12.5,
              color: "var(--bone-dim)",
              lineHeight: 1.55,
              margin: "4px 0 0",
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

function TableCard({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="surface"
      style={{ padding: 0, overflowX: "auto" }}
    >
      {children}
    </motion.div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      style={{
        textAlign: align,
        padding: "10px 14px",
        fontFamily: "var(--font-mono)",
        fontSize: 10.5,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "var(--bone-quiet)",
        fontWeight: 500,
        borderBottom: "1px solid var(--ink-hair)",
        background: "var(--ink-elev-1)",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  mono = false,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  mono?: boolean;
}) {
  return (
    <td
      className={mono ? "num" : undefined}
      style={{
        textAlign: align,
        padding: "12px 14px",
        borderBottom: "1px solid var(--ink-hair)",
        color: "var(--bone)",
        fontSize: 13,
        fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
        verticalAlign: "top",
      }}
    >
      {children}
    </td>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block" }}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--bone-quiet)",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </label>
  );
}

function LoadingCard({ label }: { label: string }) {
  return (
    <div
      className="surface"
      style={{
        padding: "60px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        color: "var(--bone-quiet)",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
      }}
    >
      <motion.span
        animate={{ rotate: 360 }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
        style={{
          display: "inline-block",
          width: 14,
          height: 14,
          borderRadius: "50%",
          border: "1.5px solid var(--ink-hair)",
          borderTopColor: "var(--dero)",
        }}
        aria-hidden
      />
      {label}
    </div>
  );
}

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      style={{
        marginBottom: 14,
        padding: "12px 16px",
        background: "var(--vermilion-wash)",
        border: "1px solid rgba(224,93,68,0.28)",
        borderRadius: "var(--radius-sm)",
        color: "var(--bone)",
        fontSize: 12.5,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span>{message}</span>
      <button className="btn btn-ghost btn-mini" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Style primitives
// ---------------------------------------------------------------------------

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  background: "var(--ink-deep)",
  border: "1px solid var(--ink-hair)",
  borderRadius: "var(--radius-sm)",
  color: "var(--bone)",
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  outline: "none",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};
