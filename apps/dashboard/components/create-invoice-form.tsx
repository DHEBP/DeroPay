"use client";

import { useState } from "react";

type CreateInvoiceFormProps = {
  onCreated?: () => void;
};

export function CreateInvoiceForm({ onCreated }: CreateInvoiceFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [ttl, setTtl] = useState("900");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      // Convert DERO amount to atomic units
      const parts = amount.split(".");
      const whole = BigInt(parts[0] || "0") * 1_000_000_000_000n;
      const frac = parts[1]
        ? BigInt(parts[1].slice(0, 12).padEnd(12, "0"))
        : 0n;
      const atomicAmount = whole + frac;

      if (atomicAmount <= 0n) {
        setError("Amount must be positive");
        return;
      }

      const response = await fetch("/api/pay/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || undefined,
          amount: atomicAmount.toString(),
          ttlSeconds: parseInt(ttl, 10),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const invoice = await response.json();
      setSuccess(`Invoice created: ${invoice.id}`);
      setName("");
      setDescription("");
      setAmount("");
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.625rem 0.75rem",
    backgroundColor: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    color: "var(--text-primary)",
    fontSize: "0.875rem",
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "0.8rem",
    fontWeight: 500,
    color: "var(--text-secondary)",
    marginBottom: "0.375rem",
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: "grid", gap: "1rem" }}>
        <div>
          <label style={labelStyle}>Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Widget Pro, Subscription, Donation"
            required
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            style={inputStyle}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label style={labelStyle}>Amount (DERO) *</label>
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g., 5.0"
              required
              pattern="[0-9]+\.?[0-9]*"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>TTL (seconds)</label>
            <select
              value={ttl}
              onChange={(e) => setTtl(e.target.value)}
              style={inputStyle}
            >
              <option value="300">5 minutes</option>
              <option value="600">10 minutes</option>
              <option value="900">15 minutes (default)</option>
              <option value="1800">30 minutes</option>
              <option value="3600">1 hour</option>
              <option value="86400">24 hours</option>
            </select>
          </div>
        </div>

        {error && (
          <div
            style={{
              padding: "0.625rem",
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              borderRadius: "8px",
              color: "var(--danger)",
              fontSize: "0.8rem",
            }}
          >
            {error}
          </div>
        )}

        {success && (
          <div
            style={{
              padding: "0.625rem",
              backgroundColor: "rgba(16, 185, 129, 0.1)",
              borderRadius: "8px",
              color: "var(--success)",
              fontSize: "0.8rem",
            }}
          >
            {success}
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={isSubmitting}
          style={{ opacity: isSubmitting ? 0.7 : 1 }}
        >
          {isSubmitting ? "Creating..." : "Create Invoice"}
        </button>
      </div>
    </form>
  );
}
