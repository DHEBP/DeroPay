"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, ArrowDown, CheckCircle2, Users, ShieldAlert, Loader2 } from "lucide-react";

const steps = [
  { id: "deploy", duration: 2200 },
  { id: "deposit", duration: 2800 },
  { id: "funded", duration: 2200 },
  { id: "resolve", duration: 2800 },
  { id: "released", duration: 3500 },
] as const;

type StepId = (typeof steps)[number]["id"];

const Actor = ({ label, icon, active = false }: { label: string; icon: React.ReactNode; active?: boolean }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", transition: "all 0.3s", transform: active ? "scale(1.08)" : "scale(1)", opacity: active ? 1 : 0.45 }}>
    <div style={{
      width: "44px", height: "44px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
      border: active ? "1.5px solid rgba(16,185,129,0.4)" : "1px solid #1e2a24",
      background: active ? "rgba(16,185,129,0.08)" : "#000",
      color: active ? "#10b981" : "#4a6356",
    }}>
      {icon}
    </div>
    <span style={{ fontSize: "11px", fontWeight: 600, color: active ? "#6b7f75" : "#4a6356" }}>{label}</span>
  </div>
);

export const EscrowFlowDemo = () => {
  const [currentStep, setCurrentStep] = useState<StepId>("deploy");
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
        <Lock size={16} color="#10b981" />
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#6b7f75" }}>
          Escrow — Smart Contract Flow
        </span>
      </div>

      {/* Actors bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around", borderBottom: "1px solid #1e2a24", padding: "16px 20px" }}>
        <Actor label="Buyer" icon={<Users size={18} />} active={currentStep === "deposit" || currentStep === "resolve"} />
        <Actor label="Contract" icon={<Lock size={18} />} active={currentStep === "deploy" || currentStep === "funded"} />
        <Actor label="Seller" icon={<Users size={18} />} active={currentStep === "released"} />
      </div>

      {/* Demo area */}
      <div style={{ display: "flex", minHeight: "220px", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "28px 24px" }}>
        <AnimatePresence mode="wait">
          {currentStep === "deploy" && (
            <motion.div key="deploy" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "50%", border: "1px solid rgba(16,185,129,0.25)", background: "rgba(16,185,129,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Loader2 size={20} color="#10b981" className="animate-spin" />
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "15px", fontWeight: 600, color: "#f0fdf4" }}>Deploying escrow contract</p>
                <p style={{ marginTop: "4px", fontFamily: "monospace", fontSize: "11px", color: "#4a6356" }}>SCID: a7b3c9d1e5...deploying</p>
                <div style={{ marginTop: "12px", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px" }}>
                  {["Amount: 100 DERO", "Fee: 2%", "Expiry: 720 blocks"].map((tag) => (
                    <span key={tag} style={{ borderRadius: "9999px", border: "1px solid #1e2a24", background: "#000", padding: "3px 10px", fontSize: "11px", color: "#4a6356" }}>{tag}</span>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {currentStep === "deposit" && (
            <motion.div key="deposit" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
              <motion.div animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                <ArrowDown size={24} color="#10b981" />
              </motion.div>
              <div style={{ borderRadius: "10px", border: "1px solid rgba(16,185,129,0.2)", background: "rgba(16,185,129,0.06)", padding: "14px 20px", textAlign: "center" }}>
                <p style={{ fontFamily: "monospace", fontSize: "20px", fontWeight: 800, color: "#10b981" }}>100.0 DERO</p>
                <p style={{ marginTop: "4px", fontSize: "11px", color: "#4a6356" }}>Buyer depositing into contract</p>
              </div>
              <p style={{ fontSize: "12px", color: "#6b7f75" }}>
                Status: <span style={{ color: "#facc15" }}>awaiting_deposit</span> &rarr; <span style={{ color: "#10b981" }}>funded</span>
              </p>
            </motion.div>
          )}

          {currentStep === "funded" && (
            <motion.div key="funded" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
              <motion.div
                animate={{ boxShadow: ["0 0 0 0 rgba(16,185,129,0)", "0 0 24px 6px rgba(16,185,129,0.15)", "0 0 0 0 rgba(16,185,129,0)"] }}
                transition={{ repeat: Infinity, duration: 2.5 }}
                style={{ width: "52px", height: "52px", borderRadius: "50%", border: "1.5px solid rgba(16,185,129,0.35)", background: "rgba(16,185,129,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Lock size={22} color="#10b981" />
              </motion.div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "15px", fontWeight: 600, color: "#f0fdf4" }}>Funds locked in contract</p>
                <p style={{ marginTop: "4px", fontFamily: "monospace", fontSize: "13px", color: "#10b981" }}>100.0 DERO secured</p>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <span style={{ borderRadius: "9999px", border: "1px solid rgba(52,211,153,0.25)", background: "rgba(52,211,153,0.06)", padding: "4px 12px", fontSize: "11px", fontWeight: 600, color: "#34d399" }}>ConfirmDelivery</span>
                <span style={{ borderRadius: "9999px", border: "1px solid rgba(250,204,21,0.25)", background: "rgba(250,204,21,0.06)", padding: "4px 12px", fontSize: "11px", fontWeight: 600, color: "#facc15" }}>Dispute</span>
                <span style={{ borderRadius: "9999px", border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.06)", padding: "4px 12px", fontSize: "11px", fontWeight: 600, color: "#ef4444" }}>Refund</span>
              </div>
            </motion.div>
          )}

          {currentStep === "resolve" && (
            <motion.div key="resolve" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
              <ShieldAlert size={26} color="#10b981" />
              <p style={{ fontSize: "15px", fontWeight: 600, color: "#f0fdf4" }}>Buyer confirms delivery</p>
              <div style={{ width: "100%", borderRadius: "10px", border: "1px solid #1e2a24", background: "#000", padding: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "13px" }}>
                  <span style={{ color: "#6b7f75" }}>Seller receives:</span>
                  <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#10b981" }}>98.0 DERO</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "13px", marginTop: "6px" }}>
                  <span style={{ color: "#6b7f75" }}>Platform fee (2%):</span>
                  <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#4a6356" }}>2.0 DERO</span>
                </div>
              </div>
            </motion.div>
          )}

          {currentStep === "released" && (
            <motion.div key="released" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5 }}
                style={{ width: "56px", height: "56px", borderRadius: "50%", background: "rgba(16,185,129,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <CheckCircle2 size={28} color="#10b981" />
              </motion.div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "16px", fontWeight: 700, color: "#f0fdf4" }}>Escrow released</p>
                <p style={{ marginTop: "4px", fontSize: "13px", color: "#6b7f75" }}>
                  Status: <span style={{ color: "#10b981" }}>released</span> &middot; funds sent to seller
                </p>
                <div style={{ marginTop: "12px", borderRadius: "8px", border: "1px solid #1e2a24", background: "#000", padding: "8px 14px" }}>
                  <p style={{ fontFamily: "monospace", fontSize: "11px", color: "#4a6356" }}>
                    escrow.released webhook &rarr; 200 OK
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
          <div key={step.id} style={{ height: "4px", flex: 1, borderRadius: "2px", transition: "background-color 0.3s", background: i <= stepIndex ? "#10b981" : "#1e2a24" }} />
        ))}
      </div>
    </div>
  );
};
