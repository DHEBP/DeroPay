"use client";

import { useState } from "react";

type CreateEscrowFormProps = {
  onCreated?: () => void;
};

export function CreateEscrowForm({ onCreated }: CreateEscrowFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [sellerAddress, setSellerAddress] = useState("");
  const [arbitratorAddress, setArbitratorAddress] = useState("");
  const [feeBasisPoints, setFeeBasisPoints] = useState("250");
  const [blockExpiration, setBlockExpiration] = useState("60");
  const [ttl, setTtl] = useState("86400"); // 24 hours default for escrow
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

      if (!sellerAddress.startsWith("der")) {
        setError("Seller address must be a valid DERO address");
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
          escrow: {
            sellerAddress,
            arbitratorAddress: arbitratorAddress || undefined,
            feeBasisPoints: parseInt(feeBasisPoints, 10),
            blockExpiration: parseInt(blockExpiration, 10),
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(
          (data as Record<string, string>).error || `HTTP ${response.status}`
        );
      }

      const invoice = await response.json();
      const scid = (invoice as Record<string, unknown>).escrow
        ? ((invoice as Record<string, Record<string, string>>).escrow?.scid ?? "deployed")
        : "created";
      setSuccess(`Escrow invoice created: ${(invoice as Record<string, string>).id} (SCID: ${scid})`);
      setName("");
      setDescription("");
      setAmount("");
      setSellerAddress("");
      setArbitratorAddress("");
      onCreated?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create escrow invoice"
      );
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
        {/* Invoice info */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "1rem",
          }}
        >
          <div>
            <label style={labelStyle}>Invoice Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Freelance Project"
              required
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Amount (DERO) *</label>
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g., 100.0"
              required
              pattern="[0-9]+\.?[0-9]*"
              style={inputStyle}
            />
          </div>
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

        {/* Escrow parameters */}
        <div
          style={{
            padding: "1rem",
            backgroundColor: "var(--bg-secondary)",
            borderRadius: "8px",
            border: "1px solid var(--border)",
          }}
        >
          <h4
            style={{
              fontSize: "0.85rem",
              fontWeight: 600,
              marginBottom: "0.75rem",
              color: "var(--accent)",
            }}
          >
            Escrow Parameters
          </h4>

          <div style={{ display: "grid", gap: "0.75rem" }}>
            <div>
              <label style={labelStyle}>Seller Address *</label>
              <input
                type="text"
                value={sellerAddress}
                onChange={(e) => setSellerAddress(e.target.value)}
                placeholder="dero1q... or deto1q..."
                required
                style={{ ...inputStyle, fontSize: "0.8rem", fontFamily: "var(--font-mono)" }}
              />
            </div>

            <div>
              <label style={labelStyle}>
                Arbitrator Address{" "}
                <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>
                  (defaults to platform wallet)
                </span>
              </label>
              <input
                type="text"
                value={arbitratorAddress}
                onChange={(e) => setArbitratorAddress(e.target.value)}
                placeholder="dero1q... (optional)"
                style={{ ...inputStyle, fontSize: "0.8rem", fontFamily: "var(--font-mono)" }}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "0.75rem",
              }}
            >
              <div>
                <label style={labelStyle}>Fee (%)</label>
                <select
                  value={feeBasisPoints}
                  onChange={(e) => setFeeBasisPoints(e.target.value)}
                  style={inputStyle}
                >
                  <option value="0">0%</option>
                  <option value="100">1%</option>
                  <option value="250">2.5% (default)</option>
                  <option value="500">5%</option>
                  <option value="1000">10%</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>Block Expiry</label>
                <select
                  value={blockExpiration}
                  onChange={(e) => setBlockExpiration(e.target.value)}
                  style={inputStyle}
                >
                  <option value="20">20 blocks (~1hr)</option>
                  <option value="60">60 blocks (~3hr)</option>
                  <option value="120">120 blocks (~6hr)</option>
                  <option value="480">480 blocks (~1day)</option>
                  <option value="1440">1440 blocks (~3days)</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>Invoice TTL</label>
                <select
                  value={ttl}
                  onChange={(e) => setTtl(e.target.value)}
                  style={inputStyle}
                >
                  <option value="3600">1 hour</option>
                  <option value="86400">24 hours</option>
                  <option value="604800">7 days</option>
                  <option value="2592000">30 days</option>
                </select>
              </div>
            </div>
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
              wordBreak: "break-all",
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
          {isSubmitting ? "Deploying Escrow..." : "Create Escrow Invoice"}
        </button>
      </div>
    </form>
  );
}
