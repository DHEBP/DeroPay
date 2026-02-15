"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, CheckCircle2, Loader2, Fingerprint } from "lucide-react";
import { DeroIcon } from "@/components/icons/dero-icon";

const steps = [
  { id: "idle", duration: 1800 },
  { id: "connecting", duration: 2200 },
  { id: "challenge", duration: 3000 },
  { id: "signing", duration: 2000 },
  { id: "verified", duration: 3500 },
] as const;

type StepId = (typeof steps)[number]["id"];

export const AuthFlowDemo = () => {
  const [currentStep, setCurrentStep] = useState<StepId>("idle");
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const step = steps[stepIndex];
    const timer = setTimeout(() => {
      const nextIndex = (stepIndex + 1) % steps.length;
      setStepIndex(nextIndex);
      setCurrentStep(steps[nextIndex].id);
    }, step.duration);
    return () => clearTimeout(timer);
  }, [stepIndex]);

  return (
    <div style={{ position: "relative", maxWidth: "420px", margin: "0 auto", overflow: "hidden", borderRadius: "16px", border: "1px solid #1e2a24", background: "#0a0f0d" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid #1e2a24", padding: "14px 20px" }}>
        <ShieldCheck size={16} color="#10b981" />
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#6b7f75" }}>
          DeroAuth — Wallet Authentication
        </span>
      </div>

      {/* Demo area */}
      <div style={{ display: "flex", minHeight: "300px", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 24px" }}>
        <AnimatePresence mode="wait">
          {currentStep === "idle" && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}
            >
              <button style={{ display: "flex", alignItems: "center", gap: "10px", borderRadius: "12px", background: "#10b981", padding: "14px 24px", fontSize: "15px", fontWeight: 700, color: "#000", border: "none", cursor: "pointer" }}>
                <DeroIcon size={20} className="text-black" />
                Sign in with DERO
              </button>
              <p style={{ fontSize: "13px", color: "#4a6356" }}>
                No email. No password. Just your wallet.
              </p>
            </motion.div>
          )}

          {currentStep === "connecting" && (
            <motion.div
              key="connecting"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}
            >
              <div style={{ width: "56px", height: "56px", borderRadius: "50%", border: "1px solid rgba(16,185,129,0.25)", background: "rgba(16,185,129,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Loader2 size={24} color="#10b981" className="animate-spin" />
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "15px", fontWeight: 600, color: "#f0fdf4" }}>
                  Connecting to wallet...
                </p>
                <p style={{ marginTop: "6px", fontSize: "12px", color: "#4a6356", fontFamily: "monospace" }}>
                  XSWD WebSocket &middot; ws://localhost:44326
                </p>
              </div>
            </motion.div>
          )}

          {currentStep === "challenge" && (
            <motion.div
              key="challenge"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              style={{ width: "100%" }}
            >
              <div style={{ borderRadius: "10px", border: "1px solid #1e2a24", background: "#000", padding: "16px" }}>
                <p style={{ marginBottom: "12px", fontSize: "12px", fontWeight: 600, color: "#6b7f75" }}>
                  Sign this message in your wallet:
                </p>
                <pre style={{ overflow: "hidden", fontFamily: "monospace", fontSize: "12px", lineHeight: 1.7, color: "#6b7f75" }}>
                  <span style={{ color: "#10b981" }}>deropay.com</span>
                  {" wants you to sign in\nwith your DERO wallet:\n"}
                  <span style={{ color: "#f0fdf4", fontWeight: 600 }}>
                    dero1qy...k8f3x9
                  </span>
                  {"\n\nURI: https://deropay.com\nNonce: "}
                  <span style={{ color: "#10b981" }}>a7k2m4n6</span>
                  {"\nIssued At: 2026-02-14T12:00:00Z"}
                </pre>
              </div>
              <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: "#10b981" }}>
                  <Fingerprint size={14} />
                  Awaiting signature...
                </div>
              </div>
            </motion.div>
          )}

          {currentStep === "signing" && (
            <motion.div
              key="signing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}
            >
              <div style={{ width: "56px", height: "56px", borderRadius: "50%", border: "1px solid rgba(16,185,129,0.25)", background: "rgba(16,185,129,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Loader2 size={24} color="#10b981" className="animate-spin" />
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "15px", fontWeight: 600, color: "#f0fdf4" }}>
                  Verifying Schnorr signature...
                </p>
                <p style={{ marginTop: "6px", fontFamily: "monospace", fontSize: "11px", color: "#4a6356" }}>
                  BN256 curve &middot; Keccak-256 &middot; Pure TypeScript
                </p>
              </div>
            </motion.div>
          )}

          {currentStep === "verified" && (
            <motion.div
              key="verified"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", bounce: 0.5 }}
                style={{ width: "56px", height: "56px", borderRadius: "50%", background: "rgba(16,185,129,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <CheckCircle2 size={28} color="#10b981" />
              </motion.div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "16px", fontWeight: 700, color: "#f0fdf4" }}>
                  Authenticated
                </p>
                <p style={{ marginTop: "4px", fontFamily: "monospace", fontSize: "13px", color: "#6b7f75" }}>
                  dero1qy...k8f3x9
                </p>
                <div style={{ marginTop: "12px", borderRadius: "8px", border: "1px solid #1e2a24", background: "#000", padding: "8px 14px" }}>
                  <p style={{ fontFamily: "monospace", fontSize: "11px", color: "#4a6356" }}>
                    JWT issued &middot; expires in 24h
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Progress */}
      <div style={{ display: "flex", gap: "5px", borderTop: "1px solid #1e2a24", padding: "14px 20px" }}>
        {steps.map((step, i) => (
          <div
            key={step.id}
            style={{
              height: "4px",
              flex: 1,
              borderRadius: "2px",
              transition: "background-color 0.3s",
              background: i <= stepIndex ? "#10b981" : "#1e2a24",
            }}
          />
        ))}
      </div>
    </div>
  );
};
