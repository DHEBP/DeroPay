"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CreditCard, Loader2, CheckCircle2, Clock } from "lucide-react";

const steps = [
  { id: "invoice", duration: 2200 },
  { id: "qr", duration: 2800 },
  { id: "sent", duration: 2200 },
  { id: "confirming", duration: 3200 },
  { id: "confirmed", duration: 3500 },
] as const;

type StepId = (typeof steps)[number]["id"];

export const PaymentFlowDemo = () => {
  const [currentStep, setCurrentStep] = useState<StepId>("invoice");
  const [stepIndex, setStepIndex] = useState(0);
  const [confirmations, setConfirmations] = useState(0);

  // Generate stable QR pattern once
  const qrPattern = useMemo(
    () => Array.from({ length: 64 }, () => Math.random() > 0.42),
    []
  );

  useEffect(() => {
    const step = steps[stepIndex];
    const timer = setTimeout(() => {
      const nextIndex = (stepIndex + 1) % steps.length;
      setStepIndex(nextIndex);
      setCurrentStep(steps[nextIndex].id);
      if (steps[nextIndex].id === "confirming") setConfirmations(0);
    }, step.duration);
    return () => clearTimeout(timer);
  }, [stepIndex]);

  useEffect(() => {
    if (currentStep !== "confirming") return;
    const interval = setInterval(() => {
      setConfirmations((prev) => Math.min(prev + 1, 8));
    }, 350);
    return () => clearInterval(interval);
  }, [currentStep]);

  return (
    <div style={{ position: "relative", maxWidth: "420px", margin: "0 auto", overflow: "hidden", borderRadius: "16px", border: "1px solid #1e2a24", background: "#0a0f0d" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid #1e2a24", padding: "14px 20px" }}>
        <CreditCard size={16} color="#10b981" />
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#6b7f75" }}>
          DeroPay — Payment Flow
        </span>
      </div>

      {/* Demo area */}
      <div style={{ display: "flex", minHeight: "300px", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 24px" }}>
        <AnimatePresence mode="wait">
          {currentStep === "invoice" && (
            <motion.div
              key="invoice"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              style={{ width: "100%" }}
            >
              <div style={{ borderRadius: "10px", border: "1px solid #1e2a24", background: "#000", padding: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <p style={{ fontSize: "15px", fontWeight: 600, color: "#f0fdf4" }}>Premium Plan</p>
                    <p style={{ marginTop: "4px", fontSize: "12px", color: "#4a6356" }}>Monthly subscription</p>
                  </div>
                  <p style={{ fontSize: "20px", fontWeight: 800, color: "#10b981" }}>25.0 DERO</p>
                </div>
                <div style={{ marginTop: "16px", display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#4a6356" }}>
                  <Clock size={12} />
                  <span>Expires in 14:59</span>
                </div>
              </div>
              <p style={{ marginTop: "12px", textAlign: "center", fontSize: "12px", color: "#4a6356" }}>
                Invoice created &middot; generating address...
              </p>
            </motion.div>
          )}

          {currentStep === "qr" && (
            <motion.div
              key="qr"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}
            >
              {/* QR code — crisp white */}
              <div style={{ width: "160px", height: "160px", borderRadius: "12px", background: "#ffffff", padding: "12px", boxShadow: "0 0 40px -10px rgba(16,185,129,0.3)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gridTemplateRows: "repeat(8, 1fr)", gap: "2px", width: "100%", height: "100%" }}>
                  {qrPattern.map((filled, i) => (
                    <div key={i} style={{ borderRadius: "1px", background: filled ? "#000" : "#fff" }} />
                  ))}
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "15px", fontWeight: 600, color: "#f0fdf4" }}>Scan to pay</p>
                <p style={{ marginTop: "4px", maxWidth: "280px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "monospace", fontSize: "11px", color: "#4a6356" }}>
                  dero1qy4wkng7p...integrated...k8f3x9
                </p>
              </div>
            </motion.div>
          )}

          {currentStep === "sent" && (
            <motion.div
              key="sent"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}
            >
              <div style={{ width: "56px", height: "56px", borderRadius: "50%", border: "1px solid rgba(16,185,129,0.25)", background: "rgba(16,185,129,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Loader2 size={24} color="#10b981" className="animate-spin" />
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "15px", fontWeight: 600, color: "#f0fdf4" }}>Payment detected</p>
                <p style={{ marginTop: "6px", fontSize: "13px", color: "#6b7f75" }}>
                  25.0 DERO received &middot; waiting for confirmations
                </p>
              </div>
            </motion.div>
          )}

          {currentStep === "confirming" && (
            <motion.div
              key="confirming"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px" }}
            >
              <div style={{ position: "relative", width: "80px", height: "80px" }}>
                <svg width="80" height="80" viewBox="0 0 80 80" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx="40" cy="40" r="35" fill="none" stroke="#1e2a24" strokeWidth="4" />
                  <motion.circle
                    cx="40" cy="40" r="35" fill="none" stroke="#10b981" strokeWidth="4" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 35}
                    animate={{ strokeDashoffset: 2 * Math.PI * 35 * (1 - confirmations / 8) }}
                    transition={{ duration: 0.3 }}
                  />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontFamily: "monospace", fontSize: "18px", fontWeight: 800, color: "#10b981" }}>
                    {confirmations}/8
                  </span>
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "15px", fontWeight: 600, color: "#f0fdf4" }}>Confirming...</p>
                <p style={{ marginTop: "6px", fontSize: "12px", color: "#4a6356" }}>
                  DAG confirmations &middot; STABLE_LIMIT = 8
                </p>
              </div>
            </motion.div>
          )}

          {currentStep === "confirmed" && (
            <motion.div
              key="confirmed"
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
                <p style={{ fontSize: "16px", fontWeight: 700, color: "#f0fdf4" }}>Payment confirmed</p>
                <p style={{ marginTop: "4px", fontSize: "13px", color: "#6b7f75" }}>
                  25.0 DERO &middot; 8/8 confirmations
                </p>
                <div style={{ marginTop: "12px", borderRadius: "8px", border: "1px solid #1e2a24", background: "#000", padding: "8px 14px" }}>
                  <p style={{ fontFamily: "monospace", fontSize: "11px", color: "#4a6356" }}>
                    webhook POST &rarr; 200 OK
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
