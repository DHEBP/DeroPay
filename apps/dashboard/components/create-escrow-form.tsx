"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, Check, AlertCircle } from "lucide-react";

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
  const [ttl, setTtl] = useState("86400");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
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
        ? ((invoice as Record<string, Record<string, string>>).escrow?.scid ??
          "deployed")
        : "created";
      setSuccess(
        `Escrow contract deployed · ${
          (invoice as Record<string, string>).id
        } · ${scid.slice(0, 10)}…`
      );
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

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="field">
          <label className="field-label">Invoice name *</label>
          <input
            className="input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Freelance Project · Hardware · Service"
            required
          />
        </div>
        <div className="field">
          <label className="field-label">
            <span className="field-label-inline">
              Amount <span className="field-hint">(DERO)</span>
            </span>
          </label>
          <input
            className="input input-mono"
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100.00000"
            required
            pattern="[0-9]+\.?[0-9]*"
          />
        </div>
      </div>

      <div className="field">
        <label className="field-label">Description</label>
        <input
          className="input"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short line shown on checkout"
        />
      </div>

      {/* Escrow section */}
      <section
        style={{
          padding: "18px 18px 16px",
          background: "var(--ink-deep)",
          border: "1px solid var(--ink-hair)",
          borderRadius: "var(--radius)",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 14,
          }}
        >
          <ShieldCheck size={14} color="var(--dero)" />
          <span className="eyebrow" style={{ color: "var(--dero)" }}>
            Escrow Parameters
          </span>
          <span
            aria-hidden
            style={{ flex: 1, height: 1, background: "var(--ink-hair)" }}
          />
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <div className="field">
            <label className="field-label">Seller address *</label>
            <input
              className="input input-mono"
              type="text"
              value={sellerAddress}
              onChange={(e) => setSellerAddress(e.target.value)}
              placeholder="dero1q… or deto1q…"
              required
            />
          </div>

          <div className="field">
            <label className="field-label">
              <span className="field-label-inline">
                Arbitrator address <span className="field-hint">defaults to platform wallet</span>
              </span>
            </label>
            <input
              className="input input-mono"
              type="text"
              value={arbitratorAddress}
              onChange={(e) => setArbitratorAddress(e.target.value)}
              placeholder="dero1q… (optional)"
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 12,
            }}
          >
            <div className="field">
              <label className="field-label">Fee</label>
              <select
                className="select"
                value={feeBasisPoints}
                onChange={(e) => setFeeBasisPoints(e.target.value)}
              >
                <option value="0">0%</option>
                <option value="100">1%</option>
                <option value="250">2.5% (default)</option>
                <option value="500">5%</option>
                <option value="1000">10%</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label">Block expiry</label>
              <select
                className="select"
                value={blockExpiration}
                onChange={(e) => setBlockExpiration(e.target.value)}
              >
                <option value="20">20 blocks · ~1h</option>
                <option value="60">60 blocks · ~3h</option>
                <option value="120">120 blocks · ~6h</option>
                <option value="480">480 blocks · ~1d</option>
                <option value="1440">1440 blocks · ~3d</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label">Invoice TTL</label>
              <select
                className="select"
                value={ttl}
                onChange={(e) => setTtl(e.target.value)}
              >
                <option value="3600">1 hour</option>
                <option value="86400">24 hours</option>
                <option value="604800">7 days</option>
                <option value="2592000">30 days</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      <AnimatePresence mode="wait">
        {error && (
          <motion.div
            key="err"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={toast("danger")}
          >
            <AlertCircle size={14} />
            <span>{error}</span>
          </motion.div>
        )}
        {success && (
          <motion.div
            key="ok"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={toast("positive")}
          >
            <Check size={14} />
            <span style={{ wordBreak: "break-all" }}>{success}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="submit"
        className="btn btn-primary"
        disabled={isSubmitting}
        style={{ justifySelf: "flex-start" }}
      >
        <ShieldCheck size={13} />
        {isSubmitting ? "Deploying contract…" : "Deploy Escrow Invoice"}
      </button>
    </form>
  );
}

function toast(kind: "positive" | "danger"): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    borderRadius: "var(--radius)",
    background:
      kind === "positive" ? "var(--dero-wash)" : "var(--vermilion-wash)",
    color: kind === "positive" ? "var(--dero)" : "var(--vermilion)",
    border: `1px solid ${
      kind === "positive" ? "var(--dero-hair)" : "rgba(224, 93, 68, 0.3)"
    }`,
    fontSize: 11.5,
    fontFamily: "var(--font-mono)",
    letterSpacing: "0.04em",
  };
}
