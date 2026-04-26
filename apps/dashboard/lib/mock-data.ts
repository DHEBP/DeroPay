const DEMO_WALLET =
  "dero1qyr8yjnu6cl2c5yqkls0hmxe6rry77kn24nmc5fje6hm9jltyvdd5qq4hn5pn";

type MockInvoice = {
  id: string;
  name: string;
  description: string;
  status: string;
  amount: string;
  amountReceived: string;
  integratedAddress: string;
  paymentId: string;
  expiresAt: string;
  createdAt: string;
  payments: unknown[];
  /** Phase 3 #33 — optional source template id. */
  templateId?: string | null;
};

const now = Date.now();
const hour = 3600_000;
const day = 24 * hour;

const seedInvoices: MockInvoice[] = [
  { id: "inv_1", name: "Pro Plan - Annual", description: "12-month subscription", status: "completed", amount: "5000000", amountReceived: "5000000", integratedAddress: DEMO_WALLET, paymentId: "100001", expiresAt: new Date(now - 2 * day).toISOString(), createdAt: new Date(now - 2 * day).toISOString(), payments: [] },
  { id: "inv_2", name: "Consulting Session", description: "1 hour privacy review", status: "completed", amount: "1000000", amountReceived: "1000000", integratedAddress: DEMO_WALLET, paymentId: "100002", expiresAt: new Date(now - day).toISOString(), createdAt: new Date(now - day).toISOString(), payments: [] },
  { id: "inv_3", name: "VPN - 6 Months", description: "Premium VPN access", status: "completed", amount: "300000", amountReceived: "300000", integratedAddress: DEMO_WALLET, paymentId: "100003", expiresAt: new Date(now - 18 * hour).toISOString(), createdAt: new Date(now - 18 * hour).toISOString(), payments: [] },
  { id: "inv_4", name: "Widget License", description: "Commercial use license", status: "pending", amount: "250000", amountReceived: "0", integratedAddress: DEMO_WALLET, paymentId: "100004", expiresAt: new Date(now + 10 * 60_000).toISOString(), createdAt: new Date(now - 5 * 60_000).toISOString(), payments: [] },
  { id: "inv_5", name: "Dero Hoodie (XL)", description: "Black hoodie with logo", status: "completed", amount: "150000", amountReceived: "150000", integratedAddress: DEMO_WALLET, paymentId: "100005", expiresAt: new Date(now - 3 * day).toISOString(), createdAt: new Date(now - 3 * day).toISOString(), payments: [] },
  { id: "inv_6", name: "API Access - Monthly", description: "Rate-limited API key", status: "confirming", amount: "200000", amountReceived: "200000", integratedAddress: DEMO_WALLET, paymentId: "100006", expiresAt: new Date(now + 8 * 60_000).toISOString(), createdAt: new Date(now - 2 * 60_000).toISOString(), payments: [] },
  { id: "inv_7", name: "Domain Registration", description: ".dero domain for 1 year", status: "completed", amount: "100000", amountReceived: "100000", integratedAddress: DEMO_WALLET, paymentId: "100007", expiresAt: new Date(now - 5 * day).toISOString(), createdAt: new Date(now - 5 * day).toISOString(), payments: [] },
  { id: "inv_8", name: "Coffee Mug Set (x3)", description: "Ceramic mugs", status: "expired", amount: "240000", amountReceived: "0", integratedAddress: DEMO_WALLET, paymentId: "100008", expiresAt: new Date(now - 12 * hour).toISOString(), createdAt: new Date(now - 13 * hour).toISOString(), payments: [] },
  { id: "inv_9", name: "Privacy Sticker Pack", description: "50 vinyl stickers", status: "completed", amount: "25000", amountReceived: "25000", integratedAddress: DEMO_WALLET, paymentId: "100009", expiresAt: new Date(now - 4 * day).toISOString(), createdAt: new Date(now - 4 * day).toISOString(), payments: [] },
  { id: "inv_10", name: "Server Hosting - Q1", description: "VPS quarterly payment", status: "completed", amount: "800000", amountReceived: "800000", integratedAddress: DEMO_WALLET, paymentId: "100010", expiresAt: new Date(now - 7 * day).toISOString(), createdAt: new Date(now - 7 * day).toISOString(), payments: [] },
];

const invoices = new Map<string, MockInvoice>(
  seedInvoices.map((inv) => [inv.id, inv])
);

let counter = 10;

export function getMockInvoices(): MockInvoice[] {
  return [...invoices.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getMockInvoice(id: string): MockInvoice | undefined {
  return invoices.get(id);
}

export function createMockInvoice(opts: {
  name?: string;
  description?: string;
  amount?: string;
  templateId?: string | null;
}): MockInvoice {
  counter++;
  const id = `inv_${counter}`;
  const inv: MockInvoice = {
    id,
    name: opts.name || "New Invoice",
    description: opts.description || "",
    status: "pending",
    amount: opts.amount || "100000",
    amountReceived: "0",
    integratedAddress: DEMO_WALLET,
    paymentId: String(100000 + counter),
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    createdAt: new Date().toISOString(),
    payments: [],
    templateId: opts.templateId ?? null,
  };
  invoices.set(id, inv);
  return inv;
}

/**
 * Phase 3 #33 — re-export the invoice-template mock fixtures alongside the
 * other mock getters so engine.ts can discover them in one place.
 */
export { listMockInvoiceTemplates as getMockInvoiceTemplates } from "./mock-invoice-templates";

export function getMockStats() {
  const all = getMockInvoices();
  const completed = all.filter((i) => i.status === "completed");
  const totalReceived = completed.reduce((s, i) => s + BigInt(i.amount), 0n);
  return {
    total: all.length,
    created: all.length,
    pending: all.filter((i) => i.status === "pending").length,
    confirming: all.filter((i) => i.status === "confirming").length,
    completed: completed.length,
    expired: all.filter((i) => i.status === "expired").length,
    partial: 0,
    totalAmountReceived: totalReceived.toString(),
  };
}

/* -------------------------------------------------------------------------- */
/*  Period-aware mock stats                                                    */
/* -------------------------------------------------------------------------- */

type MockStatsRange = "7d" | "30d" | "90d" | `custom:${string}:${string}`;

type MockStatsTotals = {
  total: number;
  pending: number;
  confirming: number;
  completed: number;
  expired: number;
  partial: number;
  totalAmountReceived: string;
};

export type MockStatsResult = {
  current: MockStatsTotals;
  previous?: MockStatsTotals;
  series?: { settlements: number[]; volume: number[] };
  range?: MockStatsRange;
};

function rangeBoundsMock(r: MockStatsRange): { fromMs: number; toMs: number } {
  const nowMs = Date.now();
  if (r === "7d") return { fromMs: nowMs - 7 * day, toMs: nowMs };
  if (r === "30d") return { fromMs: nowMs - 30 * day, toMs: nowMs };
  if (r === "90d") return { fromMs: nowMs - 90 * day, toMs: nowMs };
  const [, from, to] = r.split(":");
  return {
    fromMs: new Date(from + "T00:00:00Z").getTime(),
    toMs: new Date(to + "T23:59:59Z").getTime(),
  };
}

function bucketCountMock(r: MockStatsRange): { count: number; granularity: "hour" | "day" } {
  if (r === "7d") return { count: 168, granularity: "hour" };
  if (r === "30d") return { count: 30, granularity: "day" };
  if (r === "90d") return { count: 90, granularity: "day" };
  const { fromMs, toMs } = rangeBoundsMock(r);
  return { count: Math.max(1, Math.ceil((toMs - fromMs) / day)), granularity: "day" };
}

/**
 * Seeded pseudo-random walk — synthesize a plausible-looking series so the
 * demo charts stay interesting across ranges without leaking into real mode.
 * Mirrors `walkData()` in components/sparkline.tsx but keeps this file free
 * of React imports.
 */
function mockWalk(seed: number, n: number, drift = 0.04, vol = 0.08): number[] {
  let s = Math.abs(seed) || 1;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const out: number[] = [];
  let cur = 20 + rand() * 15;
  for (let i = 0; i < n; i++) {
    cur += (rand() - 0.5 + drift) * vol * 100;
    out.push(Math.max(0, Math.round(cur)));
  }
  return out;
}

/**
 * Period-aware mock stats. Aggregates the seeded invoice fixtures over the
 * current/previous windows and synthesizes series using a seeded walk.
 */
export function getMockStatsRange(
  range: MockStatsRange,
  compare: boolean,
): MockStatsResult {
  const all = getMockInvoices();
  const { fromMs, toMs } = rangeBoundsMock(range);
  const windowMs = toMs - fromMs;
  const prevFromMs = fromMs - windowMs;

  const aggregate = (from: number, to: number): MockStatsTotals => {
    const totals: MockStatsTotals = {
      total: 0,
      pending: 0,
      confirming: 0,
      completed: 0,
      expired: 0,
      partial: 0,
      totalAmountReceived: "0",
    };
    let received = 0n;
    for (const inv of all) {
      const t = new Date(inv.createdAt).getTime();
      if (t < from || t >= to) continue;
      totals.total += 1;
      switch (inv.status) {
        case "pending":
          totals.pending += 1;
          break;
        case "confirming":
          totals.confirming += 1;
          break;
        case "completed":
          totals.completed += 1;
          received += BigInt(inv.amountReceived);
          break;
        case "expired":
          totals.expired += 1;
          break;
        case "partial":
          totals.partial += 1;
          break;
      }
    }
    totals.totalAmountReceived = received.toString();
    return totals;
  };

  const current = aggregate(fromMs, toMs);
  const previous = compare ? aggregate(prevFromMs, fromMs) : undefined;

  const { count } = bucketCountMock(range);
  // Seed the walk from the range so toggling 7d→30d animates to a new curve.
  const settlementsSeed =
    range === "7d" ? 11 : range === "30d" ? 101 : range === "90d" ? 303 : 505;
  const volumeSeed =
    range === "7d" ? 29 : range === "30d" ? 257 : range === "90d" ? 451 : 709;

  const settlements = mockWalk(settlementsSeed, count, 0.05, 0.12);
  const volume = mockWalk(volumeSeed, count, 0.03, 0.18);

  return {
    current,
    previous,
    series: { settlements, volume },
    range,
  };
}

export function getMockHealth() {
  return {
    status: "ok",
    engine: "running",
    wallet: {
      address: DEMO_WALLET,
      balance: "12500000",
      unlockedBalance: "12500000",
    },
  };
}

// ---------------------------------------------------------------------------
// Customer groups (Phase 2 #16)
// ---------------------------------------------------------------------------

type MockCustomerGroup = {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  createdAt: number;
  metadata: Record<string, unknown>;
};

const mockGroups: MockCustomerGroup[] = [
  {
    id: "grp_demo_vip",
    name: "VIP",
    color: "dero",
    description: "White-glove support, quarterly check-ins.",
    createdAt: Date.now() - 90 * day,
    metadata: {},
  },
  {
    id: "grp_demo_enterprise",
    name: "Enterprise",
    color: "cobalt",
    description: "Annual contracts, dedicated AM.",
    createdAt: Date.now() - 60 * day,
    metadata: {},
  },
  {
    id: "grp_demo_beta",
    name: "Beta testers",
    color: "amber",
    description: "Early access to unreleased features.",
    createdAt: Date.now() - 30 * day,
    metadata: {},
  },
];

// customerId → Set<groupId>
const mockMembership = new Map<string, Set<string>>([
  ["cp_demo_01", new Set(["grp_demo_vip", "grp_demo_enterprise"])],
  ["cp_demo_02", new Set(["grp_demo_enterprise"])],
  ["cp_demo_03", new Set(["grp_demo_beta"])],
  ["cp_demo_04", new Set(["grp_demo_vip"])],
]);

let groupCounter = mockGroups.length;

function mockGroupMemberCount(groupId: string): number {
  let n = 0;
  for (const set of mockMembership.values()) if (set.has(groupId)) n++;
  return n;
}

export function getMockCustomerGroups(
  withMemberCounts = false
): Array<MockCustomerGroup & { memberCount?: number }> {
  return mockGroups.map((g) => ({
    ...g,
    ...(withMemberCounts ? { memberCount: mockGroupMemberCount(g.id) } : {}),
  }));
}

export function getMockCustomerGroup(
  id: string
): (MockCustomerGroup & { memberCount: number }) | undefined {
  const g = mockGroups.find((x) => x.id === id);
  if (!g) return undefined;
  return { ...g, memberCount: mockGroupMemberCount(id) };
}

export function createMockCustomerGroup(args: {
  name: string;
  color?: string | null;
  description?: string | null;
}): MockCustomerGroup {
  const name = args.name.trim();
  if (mockGroups.some((g) => g.name === name)) {
    throw new Error(`Customer group name already exists: ${name}`);
  }
  groupCounter++;
  const group: MockCustomerGroup = {
    id: `grp_demo_${groupCounter}_${Math.random().toString(16).slice(2, 6)}`,
    name,
    color: args.color ?? null,
    description: args.description ?? null,
    createdAt: Date.now(),
    metadata: {},
  };
  mockGroups.push(group);
  return group;
}

export function updateMockCustomerGroup(
  id: string,
  patch: { name?: string; color?: string | null; description?: string | null }
): MockCustomerGroup {
  const g = mockGroups.find((x) => x.id === id);
  if (!g) throw new Error(`Customer group not found: ${id}`);
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (
      mockGroups.some((o) => o.id !== id && o.name === trimmed)
    ) {
      throw new Error(`Customer group name already exists: ${trimmed}`);
    }
    g.name = trimmed;
  }
  if (patch.color !== undefined) g.color = patch.color;
  if (patch.description !== undefined) g.description = patch.description;
  return g;
}

export function deleteMockCustomerGroup(id: string): void {
  const idx = mockGroups.findIndex((x) => x.id === id);
  if (idx === -1) return;
  mockGroups.splice(idx, 1);
  for (const set of mockMembership.values()) set.delete(id);
}

export function addMockGroupMembers(
  groupId: string,
  customerIds: string[]
): number {
  if (!mockGroups.some((g) => g.id === groupId)) {
    throw new Error(`Customer group not found: ${groupId}`);
  }
  let added = 0;
  for (const cid of customerIds) {
    let set = mockMembership.get(cid);
    if (!set) {
      set = new Set<string>();
      mockMembership.set(cid, set);
    }
    if (!set.has(groupId)) {
      set.add(groupId);
      added++;
    }
  }
  return added;
}

export function removeMockGroupMembers(
  groupId: string,
  customerIds: string[]
): number {
  let removed = 0;
  for (const cid of customerIds) {
    const set = mockMembership.get(cid);
    if (set?.delete(groupId)) removed++;
  }
  return removed;
}

export function getMockGroupsForCustomer(customerId: string): MockCustomerGroup[] {
  const set = mockMembership.get(customerId);
  if (!set) return [];
  return mockGroups.filter((g) => set.has(g.id));
}

export function getMockCustomersInGroup(groupId: string): string[] {
  const out: string[] = [];
  for (const [cid, set] of mockMembership.entries()) {
    if (set.has(groupId)) out.push(cid);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Atomic swaps (Phase 3 #27)
// ---------------------------------------------------------------------------
//
// Mirrors `AtomicSwap` in `lib/types.ts`. Kept as a local type so this module
// doesn't need to reach into `lib/types.ts` (which would pull a client-only
// barrel into server routes — not broken today, but cleaner to keep it self-
// contained). The shape is intentionally identical; if you change one, change
// the other.
type MockAtomicSwap = {
  id: string;
  direction: "dero-to-btc" | "btc-to-dero";
  counterparty: string;
  state:
    | "proposed"
    | "funding"
    | "funded"
    | "claiming"
    | "completed"
    | "refunded"
    | "failed";
  deroAmount: string;
  btcAmount: string;
  refundTimeoutMs: number | null;
  createdAt: number;
  completedAt: number | null;
  lastTxHash?: string;
};

/**
 * Seeded atomic swap fixtures. A mix of in-flight states plus a recently
 * completed one so the lane demonstrates tone variety and the refund
 * countdown ticker.
 */
export function getMockAtomicSwaps(): MockAtomicSwap[] {
  const nowMs = Date.now();
  return [
    {
      id: "swp_demo_01",
      direction: "dero-to-btc",
      counterparty: "dero1q..alice",
      state: "funded",
      deroAmount: "1250000", // 12.5 DERO in atomic units
      btcAmount: "210000", // 0.0021 BTC in sats
      refundTimeoutMs: nowMs + 23 * hour + 12 * 60_000,
      createdAt: nowMs - 40 * 60_000,
      completedAt: null,
      lastTxHash: "a1b2c3d4e5f6",
    },
    {
      id: "swp_demo_02",
      direction: "btc-to-dero",
      counterparty: "bc1q..bob",
      state: "claiming",
      deroAmount: "500000", // 5 DERO
      btcAmount: "85000", // 0.00085 BTC
      refundTimeoutMs: nowMs + 4 * hour + 28 * 60_000,
      createdAt: nowMs - 3 * hour,
      completedAt: null,
    },
    {
      id: "swp_demo_03",
      direction: "dero-to-btc",
      counterparty: "dero1q..carol",
      state: "proposed",
      deroAmount: "100000", // 1 DERO
      btcAmount: "17000",
      refundTimeoutMs: nowMs + 47 * hour,
      createdAt: nowMs - 8 * 60_000,
      completedAt: null,
    },
  ];
}

export function getMockEscrows() {
  return [
    { id: "esc_1", invoiceId: "inv_1", status: "released", buyer: "dero1q..buyer", seller: "dero1q..seller", amount: "5000000", feeBasisPoints: 250, createdAt: new Date(now - 2 * day).toISOString() },
    { id: "esc_2", invoiceId: "inv_2", status: "funded", buyer: "dero1q..buyer2", seller: "dero1q..seller2", amount: "1000000", feeBasisPoints: 250, createdAt: new Date(now - day).toISOString() },
    { id: "esc_3", invoiceId: "inv_5", status: "released", buyer: "dero1q..buyer3", seller: "dero1q..seller3", amount: "150000", feeBasisPoints: 250, createdAt: new Date(now - 3 * day).toISOString() },
  ];
}

// ---------------------------------------------------------------------------
// Phase 3 #37 — Mock sweeps + sweep schedules (demo mode only)
// ---------------------------------------------------------------------------
//
// We keep the mock state process-local so the demo UI can walk through the
// full flow (create schedule, fire instant sweep, see history row appear)
// without hitting the real wallet or SQLite store.

const ATOMIC_PER_DERO = 100_000n;
const TREASURY_DEMO =
  "dero1qdemotreasurydemotreasurydemotreasurydemotreasurydemotreasurydemotr";

type MockSweep = {
  id: string;
  fromWallet: string;
  toWallet: string;
  amount: string;
  memo: string | null;
  status: "pending" | "submitted" | "confirmed" | "failed";
  scheduledAt: number | null;
  executedAt: number | null;
  txHash: string | null;
  error: string | null;
  createdAt: number;
  metadata: Record<string, unknown>;
};

type MockSweepSchedule = {
  id: string;
  name: string;
  toWallet: string;
  frequency: "daily" | "weekly";
  timeUtc: string;
  dailyLimit: string | null;
  minBalanceReserve: string;
  enabled: boolean;
  lastRunAt: number | null;
  createdAt: number;
};

const mockSweeps: MockSweep[] = [
  {
    id: "sw_demo_001",
    fromWallet: "dero1qdemodemodemodemodemodemodemodemodemodemodemodemodemodemod",
    toWallet: TREASURY_DEMO,
    amount: (797n * ATOMIC_PER_DERO).toString(),
    memo: "scheduled:Nightly treasury",
    status: "confirmed",
    scheduledAt: now - 2 * hour,
    executedAt: now - 2 * hour + 5_000,
    txHash:
      "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
    error: null,
    createdAt: now - 2 * hour,
    metadata: { scheduleId: "ss_demo_001" },
  },
  {
    id: "sw_demo_002",
    fromWallet: "dero1qdemodemodemodemodemodemodemodemodemodemodemodemodemodemod",
    toWallet: TREASURY_DEMO,
    amount: (250n * ATOMIC_PER_DERO).toString(),
    memo: "manual",
    status: "confirmed",
    scheduledAt: null,
    executedAt: now - 8 * hour + 3_000,
    txHash:
      "bb22cc33dd44ee55ff66aa7788990011223344556677889900aabbccddeeff00",
    error: null,
    createdAt: now - 8 * hour,
    metadata: {},
  },
  {
    id: "sw_demo_003",
    fromWallet: "dero1qdemodemodemodemodemodemodemodemodemodemodemodemodemodemod",
    toWallet: TREASURY_DEMO,
    amount: (12n * ATOMIC_PER_DERO).toString(),
    memo: "manual",
    status: "failed",
    scheduledAt: null,
    executedAt: null,
    txHash: null,
    error: "Insufficient unlocked balance (demo)",
    createdAt: now - 12 * hour,
    metadata: {},
  },
];

const mockSchedules: MockSweepSchedule[] = [
  {
    id: "ss_demo_001",
    name: "Nightly treasury",
    toWallet: TREASURY_DEMO,
    frequency: "daily",
    timeUtc: "02:00",
    dailyLimit: (1000n * ATOMIC_PER_DERO).toString(),
    minBalanceReserve: (50n * ATOMIC_PER_DERO).toString(),
    enabled: true,
    lastRunAt: now - 2 * hour,
    createdAt: now - 30 * day,
  },
  {
    id: "ss_demo_002",
    name: "Weekly cold storage",
    toWallet: TREASURY_DEMO,
    frequency: "weekly",
    timeUtc: "04:30",
    dailyLimit: null,
    minBalanceReserve: (100n * ATOMIC_PER_DERO).toString(),
    enabled: false,
    lastRunAt: null,
    createdAt: now - 60 * day,
  },
];

let sweepCounter = 3;
let scheduleCounter = 2;

export function getMockSweeps(): MockSweep[] {
  return [...mockSweeps].sort((a, b) => b.createdAt - a.createdAt);
}

export function getMockSweep(id: string): MockSweep | undefined {
  return mockSweeps.find((s) => s.id === id);
}

export function createMockSweep(opts: {
  toWallet: string;
  amount: string;
  memo?: string;
}): MockSweep {
  sweepCounter++;
  const id = `sw_demo_${String(sweepCounter).padStart(3, "0")}`;
  const sweep: MockSweep = {
    id,
    fromWallet: "dero1qdemodemodemodemodemodemodemodemodemodemodemodemodemodemod",
    toWallet: opts.toWallet,
    amount: opts.amount,
    memo: opts.memo ?? "manual",
    status: "submitted",
    scheduledAt: null,
    executedAt: Date.now(),
    txHash:
      "demo" + String(sweepCounter).padStart(60, "0"),
    error: null,
    createdAt: Date.now(),
    metadata: {},
  };
  mockSweeps.unshift(sweep);
  // Roll to confirmed after a short delay so the demo UI sees the transition.
  setTimeout(() => {
    sweep.status = "confirmed";
  }, 1_500);
  return sweep;
}

export function getMockSweepSchedules(enabled?: boolean): MockSweepSchedule[] {
  if (enabled === undefined) return [...mockSchedules];
  return mockSchedules.filter((s) => s.enabled === enabled);
}

export function getMockSweepSchedule(id: string): MockSweepSchedule | undefined {
  return mockSchedules.find((s) => s.id === id);
}

export function createMockSweepSchedule(opts: {
  name: string;
  toWallet: string;
  frequency: "daily" | "weekly";
  timeUtc: string;
  dailyLimit?: string | null;
  minBalanceReserve?: string;
  enabled?: boolean;
}): MockSweepSchedule {
  scheduleCounter++;
  const schedule: MockSweepSchedule = {
    id: `ss_demo_${String(scheduleCounter).padStart(3, "0")}`,
    name: opts.name,
    toWallet: opts.toWallet,
    frequency: opts.frequency,
    timeUtc: opts.timeUtc,
    dailyLimit: opts.dailyLimit ?? null,
    minBalanceReserve: opts.minBalanceReserve ?? "0",
    enabled: opts.enabled !== false,
    lastRunAt: null,
    createdAt: Date.now(),
  };
  mockSchedules.unshift(schedule);
  return schedule;
}

export function updateMockSweepSchedule(
  id: string,
  patch: Partial<MockSweepSchedule>
): MockSweepSchedule | undefined {
  const s = mockSchedules.find((x) => x.id === id);
  if (!s) return undefined;
  Object.assign(s, patch);
  return s;
}

export function deleteMockSweepSchedule(id: string): boolean {
  const idx = mockSchedules.findIndex((s) => s.id === id);
  if (idx < 0) return false;
  mockSchedules.splice(idx, 1);
  return true;
}
