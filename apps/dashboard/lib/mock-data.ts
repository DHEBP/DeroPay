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
  };
  invoices.set(id, inv);
  return inv;
}

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

export function getMockEscrows() {
  return [
    { id: "esc_1", invoiceId: "inv_1", status: "released", buyer: "dero1q..buyer", seller: "dero1q..seller", amount: "5000000", feeBasisPoints: 250, createdAt: new Date(now - 2 * day).toISOString() },
    { id: "esc_2", invoiceId: "inv_2", status: "funded", buyer: "dero1q..buyer2", seller: "dero1q..seller2", amount: "1000000", feeBasisPoints: 250, createdAt: new Date(now - day).toISOString() },
    { id: "esc_3", invoiceId: "inv_5", status: "released", buyer: "dero1q..buyer3", seller: "dero1q..seller3", amount: "150000", feeBasisPoints: 250, createdAt: new Date(now - 3 * day).toISOString() },
  ];
}
