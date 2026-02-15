"use client";

import { useEffect, useState, useCallback } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { InvoiceTable } from "@/components/invoice-table";
import { CreateInvoiceForm } from "@/components/create-invoice-form";

export function InvoicesPage() {
  const [invoices, setInvoices] = useState<unknown[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const fetchInvoices = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (filter !== "all") {
        params.set("status", filter);
      }
      const response = await fetch(`/api/pay/invoices?${params.toString()}`);
      if (response.ok) {
        setInvoices(await response.json());
      }
    } catch {
      // Handle silently
    }
  }, [filter]);

  useEffect(() => {
    fetchInvoices();
    const interval = setInterval(fetchInvoices, 10_000);
    return () => clearInterval(interval);
  }, [fetchInvoices]);

  const filterOptions = [
    { value: "all", label: "All" },
    { value: "pending", label: "Pending" },
    { value: "confirming", label: "Confirming" },
    { value: "completed", label: "Completed" },
    { value: "expired", label: "Expired" },
    { value: "partial", label: "Partial" },
  ];

  return (
    <DashboardShell>
      <div
        style={{
          marginBottom: "2rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
            Invoices
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
            Create and manage payment invoices
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          {showCreateForm ? "Cancel" : "+ New Invoice"}
        </button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>
            Create Invoice
          </h3>
          <CreateInvoiceForm
            onCreated={() => {
              setShowCreateForm(false);
              fetchInvoices();
            }}
          />
        </div>
      )}

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: "1rem",
          flexWrap: "wrap",
        }}
      >
        {filterOptions.map((opt) => (
          <button
            key={opt.value}
            className="btn btn-secondary"
            onClick={() => setFilter(opt.value)}
            style={{
              backgroundColor:
                filter === opt.value ? "var(--border)" : undefined,
              fontSize: "0.8rem",
              padding: "0.375rem 0.75rem",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Invoice list */}
      <div className="card" style={{ padding: 0 }}>
        <InvoiceTable
          invoices={invoices as Parameters<typeof InvoiceTable>[0]["invoices"]}
        />
      </div>
    </DashboardShell>
  );
}
