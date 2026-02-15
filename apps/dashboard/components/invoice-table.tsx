"use client";

type SerializedInvoice = {
  id: string;
  name: string;
  description: string;
  amount: string;
  status: string;
  paymentId: string;
  integratedAddress: string;
  createdAt: string;
  expiresAt: string;
  completedAt: string | null;
  amountReceived: string;
  payments: Array<{
    txid: string;
    amount: string;
    confirmations: number;
    status: string;
  }>;
};

type InvoiceTableProps = {
  invoices: SerializedInvoice[];
};

function formatAmount(atomic: string): string {
  const value = BigInt(atomic);
  const whole = value / 1_000_000_000_000n;
  const frac = value % 1_000_000_000_000n;
  const fracStr = frac.toString().padStart(12, "0").slice(0, 5);
  return `${whole}.${fracStr}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncateId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}...${id.slice(-4)}`;
}

export function InvoiceTable({ invoices }: InvoiceTableProps) {
  if (invoices.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "3rem 1rem",
          color: "var(--text-muted)",
        }}
      >
        <p>No invoices yet</p>
        <p style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}>
          Create your first invoice to start accepting DERO payments.
        </p>
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Amount</th>
            <th>Received</th>
            <th>Status</th>
            <th>Created</th>
            <th>Payments</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.id}>
              <td>
                <code className="mono">{truncateId(inv.id)}</code>
              </td>
              <td>{inv.name}</td>
              <td className="mono">{formatAmount(inv.amount)} DERO</td>
              <td className="mono">{formatAmount(inv.amountReceived)} DERO</td>
              <td>
                <span className={`badge badge-${inv.status}`}>
                  <span
                    style={{
                      display: "inline-block",
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      backgroundColor: "currentColor",
                    }}
                    className={
                      inv.status === "pending" || inv.status === "confirming"
                        ? "pulse"
                        : ""
                    }
                  />
                  {inv.status}
                </span>
              </td>
              <td style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                {formatDate(inv.createdAt)}
              </td>
              <td className="mono">{inv.payments.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
