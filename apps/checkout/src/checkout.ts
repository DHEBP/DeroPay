import { renderQR } from "./qr.js";

type InvoiceData = {
  id: string;
  name: string;
  description?: string;
  status: string;
  amount: string;
  amountReceived: string;
  integratedAddress: string;
  expiresAt: string;
  createdAt: string;
  payments: unknown[];
};

const POLL_INTERVAL_MS = 4000;
const ATOMIC_UNITS_PER_DERO = 100_000;
const DEMO_ADDRESS =
  "deri1qy0ehnqcg0rr4qlsgkfgpv3cx6fmk9pq0a95rfhssmacxvhfvz2yqg2wpnee0gf5qmet0e8w4gp3sxm6t7ycx5qd6w5kfzlsq9ycx0z3qsadmn5k";

const $ = (id: string) => document.getElementById(id)!;

function getParams(): { gateway: string; invoiceId: string; demo: boolean } | null {
  const params = new URLSearchParams(window.location.search);
  const demo = params.get("demo") === "true";
  const gateway = params.get("gateway");
  const invoiceId = params.get("invoiceId") || params.get("id");

  if (demo) return { gateway: "", invoiceId: "", demo: true };
  if (!gateway || !invoiceId) return demo ? { gateway: "", invoiceId: "", demo: true } : null;
  return { gateway: gateway.replace(/\/$/, ""), invoiceId, demo: false };
}

function formatDero(atomicStr: string): string {
  const n = Number(atomicStr);
  return (n / ATOMIC_UNITS_PER_DERO).toFixed(5);
}

function showState(id: string): void {
  for (const el of document.querySelectorAll<HTMLElement>(".state")) {
    el.classList.add("hidden");
  }
  $(id).classList.remove("hidden");
}

async function fetchInvoice(gateway: string, invoiceId: string): Promise<InvoiceData> {
  const res = await fetch(`${gateway}/status?invoiceId=${encodeURIComponent(invoiceId)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || `HTTP ${res.status}`);
  }
  return res.json();
}

function createDemoInvoice(): InvoiceData {
  return {
    id: "inv_demo_checkout",
    name: "Premium Plan",
    description: "Monthly subscription",
    status: "pending",
    amount: "2500000",
    amountReceived: "0",
    integratedAddress: DEMO_ADDRESS,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    payments: [],
  };
}

function renderPayment(invoice: InvoiceData): void {
  $("invoice-name").textContent = invoice.name;
  $("invoice-description").textContent = invoice.description || "";

  const deroAmount = formatDero(invoice.amount);
  $("dero-amount").textContent = deroAmount;

  $("payment-address").textContent = invoice.integratedAddress;

  renderQR($("qr-code"), invoice.integratedAddress, 200);

  updateStatus(invoice);
  showState("payment-state");
}

function updateStatus(invoice: InvoiceData): void {
  const bar = document.querySelector<HTMLElement>(".status-bar")!;
  const icon = $("status-icon");
  const text = $("status-text");

  bar.className = "status-bar";

  switch (invoice.status) {
    case "pending":
      icon.textContent = "⏳";
      text.textContent = "Waiting for payment...";
      break;
    case "confirming":
      icon.textContent = "⛏";
      text.textContent = "Payment detected — confirming...";
      bar.classList.add("confirming");
      break;
    case "partial":
      icon.textContent = "⚠️";
      text.textContent = `Partial payment received (${formatDero(invoice.amountReceived)} DERO)`;
      bar.classList.add("confirming");
      break;
    case "completed":
      icon.textContent = "✓";
      text.textContent = "Payment confirmed!";
      bar.classList.add("completed");
      break;
    case "expired":
      showState("expired-state");
      return;
  }

  updateCountdown(invoice.expiresAt);
}

function updateCountdown(expiresAt: string): void {
  const el = $("countdown");
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) {
    el.textContent = "Expired";
    return;
  }
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  el.textContent = `Expires in ${mins}:${secs.toString().padStart(2, "0")}`;
}

let countdownTimer: number | null = null;

function runDemoMode(): void {
  $("demo-banner").classList.remove("hidden");

  const invoice = createDemoInvoice();
  renderPayment(invoice);

  const simBtn = $("simulate-btn");
  simBtn.classList.remove("hidden");

  countdownTimer = window.setInterval(() => {
    updateCountdown(invoice.expiresAt);
  }, 1000);

  simBtn.addEventListener("click", () => {
    simBtn.setAttribute("disabled", "true");
    simBtn.textContent = "Sending...";

    invoice.status = "confirming";
    invoice.amountReceived = invoice.amount;
    updateStatus(invoice);

    setTimeout(() => {
      invoice.status = "completed";
      updateStatus(invoice);
      if (countdownTimer) clearInterval(countdownTimer);
      setTimeout(() => {
        $("success-detail").textContent = `${formatDero(invoice.amount)} DERO received`;
        showState("success-state");
      }, 1500);
    }, 3000);
  });
}

async function main(): Promise<void> {
  const params = getParams();
  if (!params) {
    runDemoMode();
    return;
  }

  if (params.demo) {
    runDemoMode();
    return;
  }

  try {
    const invoice = await fetchInvoice(params.gateway, params.invoiceId);

    if (invoice.status === "completed") {
      $("success-detail").textContent = `${formatDero(invoice.amount)} DERO received`;
      showState("success-state");
      return;
    }

    if (invoice.status === "expired") {
      showState("expired-state");
      return;
    }

    renderPayment(invoice);

    countdownTimer = window.setInterval(() => {
      updateCountdown(invoice.expiresAt);
    }, 1000);

    poll(params.gateway, params.invoiceId);
  } catch (err) {
    $("error-message").textContent =
      err instanceof Error ? err.message : "Failed to load invoice";
    showState("error-state");
  }
}

async function poll(gateway: string, invoiceId: string): Promise<void> {
  try {
    const invoice = await fetchInvoice(gateway, invoiceId);
    updateStatus(invoice);

    if (invoice.status === "completed") {
      if (countdownTimer) clearInterval(countdownTimer);
      setTimeout(() => {
        $("success-detail").textContent = `${formatDero(invoice.amount)} DERO received`;
        showState("success-state");
      }, 1500);
      return;
    }

    if (invoice.status === "expired") {
      if (countdownTimer) clearInterval(countdownTimer);
      return;
    }
  } catch {
    // network error — keep polling
  }

  setTimeout(() => poll(gateway, invoiceId), POLL_INTERVAL_MS);
}

$("copy-btn")?.addEventListener("click", async () => {
  const address = $("payment-address").textContent || "";
  await navigator.clipboard.writeText(address);
  const btn = $("copy-btn");
  btn.classList.add("copied");
  setTimeout(() => btn.classList.remove("copied"), 2000);
});

main();
