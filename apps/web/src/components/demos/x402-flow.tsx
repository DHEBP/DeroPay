"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Loader2, CheckCircle2, Lock, FileCheck2 } from "lucide-react";

const steps = [
  { id: "request", duration: 2000 },
  { id: "challenge", duration: 3200 },
  { id: "paying", duration: 2400 },
  { id: "retry", duration: 2800 },
  { id: "granted", duration: 3200 },
] as const;

type StepId = (typeof steps)[number]["id"];

export const X402FlowDemo = () => {
  const [currentStep, setCurrentStep] = useState<StepId>("request");
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
        <Bot size={16} color="#10b981" />
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#6b7f75" }}>
          DeroPay — x402 Request Loop
        </span>
      </div>

      {/* Demo area */}
      <div style={{ display: "flex", minHeight: "300px", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 24px" }}>
        <AnimatePresence mode="wait">
          {currentStep === "request" && (
            <motion.div
              key="request"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              style={{ width: "100%" }}
            >
              <div style={{ borderRadius: "10px", border: "1px solid #1e2a24", background: "#000", padding: "16px" }}>
                <p style={{ marginBottom: "10px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#4a6356" }}>
                  Agent request
                </p>
                <pre style={{ margin: 0, overflow: "hidden", fontFamily: "monospace", fontSize: "12px", lineHeight: 1.7, color: "#6b7f75" }}>
                  <span style={{ color: "#10b981", fontWeight: 700 }}>GET</span>
                  {" /api/protected/inference\n"}
                  {"Host: "}
                  <span style={{ color: "#f0fdf4" }}>api.example.com</span>
                  {"\nUser-Agent: "}
                  <span style={{ color: "#f0fdf4" }}>agent/1.0</span>
                </pre>
              </div>
              <p style={{ marginTop: "12px", textAlign: "center", fontSize: "12px", color: "#4a6356" }}>
                Client requests a paid resource
              </p>
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
              <div style={{ borderRadius: "10px", border: "1px solid rgba(147,51,234,0.35)", background: "#000", padding: "16px", boxShadow: "0 0 40px -14px rgba(147,51,234,0.4)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                  <Lock size={14} color="#a855f7" />
                  <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a855f7" }}>
                    402 Payment Required
                  </p>
                </div>
                <pre style={{ margin: 0, overflow: "hidden", fontFamily: "monospace", fontSize: "11px", lineHeight: 1.7, color: "#6b7f75" }}>
                  {"WWW-Authenticate: X402\n"}
                  {"{\n  \"asset\": "}
                  <span style={{ color: "#10b981" }}>&quot;DERO&quot;</span>
                  {",\n  \"amountAtomic\": "}
                  <span style={{ color: "#f0fdf4" }}>&quot;10000&quot;</span>
                  {",\n  \"invoiceId\": "}
                  <span style={{ color: "#f0fdf4" }}>&quot;inv_7k2m4&quot;</span>
                  {",\n  \"resource\": "}
                  <span style={{ color: "#f0fdf4" }}>&quot;/api/.../inference&quot;</span>
                  {"\n}"}
                </pre>
              </div>
              <p style={{ marginTop: "12px", textAlign: "center", fontSize: "12px", color: "#4a6356" }}>
                Server responds with a machine-readable challenge
              </p>
            </motion.div>
          )}

          {currentStep === "paying" && (
            <motion.div
              key="paying"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}
            >
              <div style={{ width: "56px", height: "56px", borderRadius: "50%", border: "1px solid rgba(16,185,129,0.25)", background: "rgba(16,185,129,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Loader2 size={24} color="#10b981" className="animate-spin" />
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "15px", fontWeight: 600, color: "#f0fdf4" }}>Paying invoice on DERO</p>
                <p style={{ marginTop: "6px", fontFamily: "monospace", fontSize: "11px", color: "#4a6356" }}>
                  0.10 DERO &middot; inv_7k2m4 &middot; encrypted settlement
                </p>
              </div>
            </motion.div>
          )}

          {currentStep === "retry" && (
            <motion.div
              key="retry"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              style={{ width: "100%" }}
            >
              <div style={{ borderRadius: "10px", border: "1px solid #1e2a24", background: "#000", padding: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                  <FileCheck2 size={14} color="#10b981" />
                  <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#10b981" }}>
                    Retry with signed receipt
                  </p>
                </div>
                <pre style={{ margin: 0, overflow: "hidden", fontFamily: "monospace", fontSize: "11px", lineHeight: 1.7, color: "#6b7f75" }}>
                  <span style={{ color: "#10b981", fontWeight: 700 }}>GET</span>
                  {" /api/protected/inference\n"}
                  <span style={{ color: "#a855f7" }}>Authorization:</span>
                  {" X402 proof=\n  "}
                  <span style={{ color: "#f0fdf4" }}>&quot;eyJhbGciOi...k8f3x9&quot;</span>
                </pre>
              </div>
              <p style={{ marginTop: "12px", textAlign: "center", fontSize: "12px", color: "#4a6356" }}>
                Receipt verified locally &middot; signature + jti + policy
              </p>
            </motion.div>
          )}

          {currentStep === "granted" && (
            <motion.div
              key="granted"
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
                <p style={{ fontSize: "16px", fontWeight: 700, color: "#f0fdf4" }}>200 OK &middot; resource served</p>
                <p style={{ marginTop: "4px", fontSize: "13px", color: "#6b7f75" }}>
                  Paid request fulfilled &middot; audit event emitted
                </p>
                <div style={{ marginTop: "12px", borderRadius: "8px", border: "1px solid #1e2a24", background: "#000", padding: "8px 14px" }}>
                  <p style={{ fontFamily: "monospace", fontSize: "11px", color: "#4a6356" }}>
                    x402.receipt_used &middot; jti a7k2m4n6
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
