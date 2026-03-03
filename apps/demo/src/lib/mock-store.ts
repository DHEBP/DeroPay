const DEMO_ADDRESS =
  "deri1qy0ehnqcg0rr4qlsgkfgpv3cx6fmk9pq0a95rfhssmacxvhfvz2yqg2wpnee0gf5qmet0e8w4gp3sxm6t7ycx5qd6w5kfzlsq9ycx0z3qsadmn5k";

type MockInvoice = {
  id: string;
  name: string;
  description: string;
  status: "pending" | "confirming" | "completed" | "expired";
  amount: string;
  amountReceived: string;
  paymentId: string;
  integratedAddress: string;
  expiresAt: string;
  createdAt: string;
  payments: unknown[];
};

const invoices = new Map<string, MockInvoice>();

let counter = 0;

export function createMockInvoice(opts: {
  name?: string;
  description?: string;
  amount?: string;
}): MockInvoice {
  counter++;
  const id = `inv_demo_${Date.now()}_${counter}`;
  const invoice: MockInvoice = {
    id,
    name: opts.name || "Demo Invoice",
    description: opts.description || "",
    status: "pending",
    amount: opts.amount || "2500000",
    amountReceived: "0",
    paymentId: String(Math.floor(Math.random() * 900000) + 100000),
    integratedAddress: DEMO_ADDRESS,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    payments: [],
  };
  invoices.set(id, invoice);
  return invoice;
}

export function getMockInvoice(id: string): MockInvoice | undefined {
  return invoices.get(id);
}

export function simulatePayment(id: string): MockInvoice | undefined {
  const inv = invoices.get(id);
  if (!inv) return undefined;

  if (inv.status === "pending") {
    inv.status = "confirming";
    inv.amountReceived = inv.amount;
    setTimeout(() => {
      const current = invoices.get(id);
      if (current && current.status === "confirming") {
        current.status = "completed";
      }
    }, 3000);
  }
  return inv;
}
