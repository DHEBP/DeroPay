import { renderQR } from "./qr.js";

type InvoiceEscrowData = {
  scid: string | null;
  escrowStatus: string;
  buyerAddress: string | null;
  feeBasisPoints: number;
  sellerAddress: string;
} | null;

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
  // Present only on escrow-backed invoices (spread from the escrow blob by the
  // gateway's serializeInvoice). Absent/null on ordinary invoices.
  escrow?: InvoiceEscrowData;
};

// Polling: start fast, back off exponentially up to a cap, and stop after a
// hard ceiling so a dead gateway is never hammered forever.
const POLL_BASE_MS = 4000;
const POLL_MAX_MS = 45_000;
const POLL_MAX_DURATION_MS = 30 * 60 * 1000; // give up after ~30 min

// DERO uses 5 decimals: 1 DERO = 100_000 atomic units. Source of truth is the
// SDK helper `atomicToDero` in packages/dero-pay/src/core/pricing.ts
// (ATOMIC_UNITS_PER_DERO). Kept as a local literal to keep this page
// dependency-free; must stay in sync with the SDK.
const ATOMIC_UNITS_PER_DERO = 100_000;
const DEMO_ADDRESS =
  "deri1qy0ehnqcg0rr4qlsgkfgpv3cx6fmk9pq0a95rfhssmacxvhfvz2yqg2wpnee0gf5qmet0e8w4gp3sxm6t7ycx5qd6w5kfzlsq9ycx0z3qsadmn5k";

const $ = (id: string) => document.getElementById(id)!;

const STATUS_ICON_HTML = {
  pending:
    '<svg class="status-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></svg>',
  confirming:
    '<svg class="status-icon-svg status-icon-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>',
  partial:
    '<svg class="status-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m10.29 3.86-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.71-3.14l-8-14a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  completed:
    '<svg class="status-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 12 2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>',
} as const;

function setStatusIcon(
  el: HTMLElement,
  status: keyof typeof STATUS_ICON_HTML,
): void {
  el.innerHTML = STATUS_ICON_HTML[status];
}

type ParamsResult =
  | { ok: true; gateway: string; invoiceId: string; claimToken: string; demo: boolean }
  | { ok: false; error: string };

function getParams(): ParamsResult {
  const params = new URLSearchParams(window.location.search);
  const demo = params.get("demo") === "true";
  const gateway = params.get("gateway");
  const invoiceId = params.get("invoiceId") || params.get("id");
  // Merchant claim token — required only for the escrow claim step. Ordinary
  // invoices ignore it. It is passed through the URL by the merchant and posted
  // to the gateway's public claim route; it is NEVER read back from /status.
  const claimToken = params.get("claimToken") || "";

  if (demo) return { ok: true, gateway: "", invoiceId: "", claimToken: "", demo: true };

  if (!gateway && !invoiceId) return { ok: false, error: "missing" };
  if (!gateway) {
    return { ok: false, error: "Missing gateway URL in the payment link." };
  }
  if (!invoiceId) {
    return { ok: false, error: "Missing invoice ID in the payment link." };
  }

  let url: URL;
  try {
    url = new URL(gateway);
  } catch {
    return { ok: false, error: "The gateway URL in this payment link is not valid." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "The gateway URL must be an http(s) address." };
  }

  return {
    ok: true,
    gateway: gateway.replace(/\/$/, ""),
    invoiceId,
    claimToken,
    demo: false,
  };
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

// A definitive error means the invoice/gateway will not recover on retry
// (bad request, not found) — polling must stop and surface it. Everything else
// (network failure, 5xx, timeout) is transient and safe to retry.
class DefinitiveError extends Error {}

async function fetchInvoice(gateway: string, invoiceId: string): Promise<InvoiceData> {
  const res = await fetch(`${gateway}/status?invoiceId=${encodeURIComponent(invoiceId)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = (body as any).error || `HTTP ${res.status}`;
    if (res.status === 404) throw new DefinitiveError("Invoice not found.");
    if (res.status === 400) throw new DefinitiveError(msg);
    throw new Error(msg);
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
    case "created":
      setStatusIcon(icon, "pending");
      text.textContent = "Preparing invoice — awaiting payment details...";
      break;
    case "pending":
      setStatusIcon(icon, "pending");
      text.textContent = "Waiting for payment...";
      break;
    case "confirming":
      setStatusIcon(icon, "confirming");
      text.textContent = "Payment detected — confirming...";
      bar.classList.add("confirming");
      break;
    case "partial": {
      setStatusIcon(icon, "partial");
      const received = Number(invoice.amountReceived) / ATOMIC_UNITS_PER_DERO;
      const total = Number(invoice.amount) / ATOMIC_UNITS_PER_DERO;
      const shortfall = Math.max(0, total - received);
      text.textContent = `Partial payment received — ${formatDero(invoice.amountReceived)} of ${formatDero(invoice.amount)} DERO. Send ${shortfall.toFixed(5)} more DERO.`;
      bar.classList.add("confirming");
      break;
    }
    case "completed":
      setStatusIcon(icon, "completed");
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

// ---------------------------------------------------------------------------
// Escrow flow (claim → deposit → funded → released)
// ---------------------------------------------------------------------------
//
// SECURITY MODEL (see README): the on-chain contract already prevents theft —
// Deposit() requires SIGNER()==the bound buyer, and the first claim wins. The
// public claim here only BINDS the buyer's refund/dispute address; the merchant
// claim token (URL param) blocks a random stranger from front-running the bind.
// No wallet-proof/XSWD is used: proving control of an address does NOT prove
// intended-buyer, so it would not close the self-bind griefing the token guards.

const DERO_BASE_ADDRESS = /^dero1[0-9a-z]{40,}$/i;
const DERO_INTEGRATED_ADDRESS = /^deto1[0-9a-z]{40,}$/i;

function showEscrowClaimError(message: string): void {
  const el = $("escrow-claim-error");
  el.textContent = message;
  el.classList.remove("hidden");
}

function clearEscrowClaimError(): void {
  const el = $("escrow-claim-error");
  el.textContent = "";
  el.classList.add("hidden");
}

function renderEscrowClaim(invoice: InvoiceData): void {
  $("escrow-claim-name").textContent = invoice.name;
  $("escrow-claim-amount").textContent = formatDero(invoice.amount);
  const feePct = (invoice.escrow?.feeBasisPoints ?? 0) / 100;
  $("escrow-claim-fee").textContent = `Escrow fee: ${feePct}% · seller-borne on release`;
  showState("escrow-claim-state");
}

function renderEscrowDeposit(invoice: InvoiceData): void {
  const esc = invoice.escrow;
  if (!esc || !esc.scid) return;

  $("escrow-deposit-name").textContent = invoice.name;
  $("escrow-deposit-amount").textContent = formatDero(invoice.amount);
  $("escrow-scid").textContent = esc.scid;
  $("escrow-bound-addr").textContent = esc.buyerAddress ?? "your bound address";

  // The buyer deposits by invoking Deposit() on this contract from their own
  // wallet. Encode the SCID in the QR so a wallet that understands SC targets can
  // prefill it; the exact deposit is still a buyer-wallet-side action (no gateway
  // write — the gateway never moves the buyer's funds).
  renderQR($("escrow-qr-code"), esc.scid, 200);

  updateEscrowDepositStatus(invoice);
  showState("escrow-deposit-state");
}

function updateEscrowDepositStatus(invoice: InvoiceData): void {
  const icon = $("escrow-status-icon");
  const text = $("escrow-status-text");
  const status = invoice.escrow?.escrowStatus;

  switch (status) {
    case "awaiting_deposit":
      setStatusIcon(icon, "pending");
      text.textContent = "Waiting for your deposit...";
      break;
    case "funded":
      setStatusIcon(icon, "confirming");
      text.textContent = "Deposit received — held in escrow.";
      break;
    case "released":
    case "expired_claimed":
      setStatusIcon(icon, "completed");
      text.textContent = "Escrow released to the seller.";
      break;
  }
}

/**
 * Drive the escrow lifecycle. A "quoted" escrow needs a buyer claim first; once
 * "awaiting_deposit" (contract deployed with an scid) we show the deposit view
 * and poll through funded → released.
 */
function runEscrowFlow(
  gateway: string,
  invoiceId: string,
  claimToken: string,
  invoice: InvoiceData,
): void {
  const status = invoice.escrow?.escrowStatus;

  // Already deployed/awaiting or beyond → straight to the deposit/monitor view.
  if (invoice.escrow?.scid && status !== "quoted") {
    if (status === "released" || status === "expired_claimed") {
      $("success-detail").textContent = `${formatDero(invoice.amount)} DERO — escrow released`;
      showState("success-state");
      return;
    }
    renderEscrowDeposit(invoice);
    pollEscrow(gateway, invoiceId);
    return;
  }

  // Needs a claim.
  renderEscrowClaim(invoice);

  const input = $("escrow-buyer-input") as HTMLInputElement;
  const btn = $("escrow-claim-btn") as HTMLButtonElement;

  btn.addEventListener("click", async () => {
    clearEscrowClaimError();
    const buyerAddress = input.value.trim();

    // Client-side format guard (the gateway re-checks). Reject deto1… integrated
    // addresses — they can never match SIGNER() on-chain and would brick Deposit().
    if (DERO_INTEGRATED_ADDRESS.test(buyerAddress)) {
      showEscrowClaimError(
        "That is an integrated (deto1…) address. Escrow needs your base wallet address (dero1…).",
      );
      return;
    }
    if (!DERO_BASE_ADDRESS.test(buyerAddress)) {
      showEscrowClaimError("That does not look like a DERO address (must start with dero1…).");
      return;
    }
    if (!claimToken) {
      showEscrowClaimError("This checkout link is missing its claim token. Ask the merchant for a fresh link.");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Submitting claim…";

    try {
      const res = await fetch(`${gateway}/checkout/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, buyerAddress, claimToken }),
      });

      if (res.status === 409) {
        // Already claimed (a race or a re-claim). If the escrow was bound to a
        // DIFFERENT address, refunds/dispute payouts route to that other wallet —
        // the buyer must NOT deposit. Warn and stop. Only continue when the bound
        // address matches (or is not yet known — deploy still in flight).
        const body = (await res.json().catch(() => ({}))) as {
          buyerAddress?: string | null;
          error?: string;
        };
        const bound = body.buyerAddress ?? null;
        if (bound && bound.toLowerCase() !== buyerAddress.toLowerCase()) {
          showEscrowClaimError(
            "This escrow is already bound to a DIFFERENT buyer. Do not deposit — refunds and dispute payouts would go to that other wallet, not yours.",
          );
          btn.disabled = false;
          btn.textContent = "Claim & Deploy Escrow";
          return;
        }
        // Same address (or not yet bound): adopt the live state and poll.
        renderEscrowDeposit(await fetchInvoice(gateway, invoiceId));
        pollEscrow(gateway, invoiceId);
        return;
      }

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Claim failed (HTTP ${res.status})`);
      }

      // 200 — the deploy was broadcast. "Done" is the awaiting_deposit + scid
      // transition, which we confirm by re-reading /status (the POST returning is
      // not itself proof the contract is live).
      const fresh = await fetchInvoice(gateway, invoiceId);
      renderEscrowDeposit(fresh);
      pollEscrow(gateway, invoiceId);
    } catch (err) {
      showEscrowClaimError(err instanceof Error ? err.message : "Claim failed");
      btn.disabled = false;
      btn.textContent = "Claim & Deploy Escrow";
    }
  });
}

async function pollEscrow(
  gateway: string,
  invoiceId: string,
  startedAt: number = Date.now(),
  delay: number = POLL_BASE_MS,
): Promise<void> {
  if (Date.now() - startedAt > POLL_MAX_DURATION_MS) {
    showPollError("Escrow timed out or unreachable. Please contact the merchant.");
    return;
  }

  try {
    const invoice = await fetchInvoice(gateway, invoiceId);
    const status = invoice.escrow?.escrowStatus;

    // The claim may still be deploying (no scid yet) — keep the deposit view up
    // once we have an scid, otherwise stay on whatever is currently shown.
    if (invoice.escrow?.scid && status !== "quoted") {
      updateEscrowDepositStatus(invoice);
      // Ensure the deposit view is populated if we arrived here mid-deploy.
      if ($("escrow-deposit-state").classList.contains("hidden") && status === "awaiting_deposit") {
        renderEscrowDeposit(invoice);
      }
    }

    if (status === "released" || status === "expired_claimed") {
      $("success-detail").textContent = `${formatDero(invoice.amount)} DERO — escrow released`;
      setTimeout(() => showState("success-state"), 1200);
      return;
    }
    if (status === "refunded") {
      $("error-message").textContent = "This escrow was refunded to the buyer.";
      showState("error-state");
      return;
    }
    if (status === "deploy_failed") {
      showPollError("Escrow contract deployment failed. Please request a new payment link.");
      return;
    }

    setTimeout(() => pollEscrow(gateway, invoiceId, startedAt, POLL_BASE_MS), POLL_BASE_MS);
  } catch (err) {
    if (err instanceof DefinitiveError) {
      showPollError(err.message);
      return;
    }
    const next = Math.min(delay * 2, POLL_MAX_MS);
    setTimeout(() => pollEscrow(gateway, invoiceId, startedAt, next), delay);
  }
}

async function main(): Promise<void> {
  const params = getParams();

  if (!params.ok) {
    if (params.error === "missing") {
      // No params at all → fall back to the interactive demo.
      runDemoMode();
      return;
    }
    $("error-message").textContent = params.error;
    showState("error-state");
    return;
  }

  if (params.demo) {
    runDemoMode();
    return;
  }

  try {
    const invoice = await fetchInvoice(params.gateway, params.invoiceId);

    // Escrow branch — cleanly separated from the P1 invoice-only flow. An escrow
    // invoice carries an `escrow` object; a non-escrow invoice does not, so this
    // never affects ordinary payments.
    if (invoice.escrow) {
      runEscrowFlow(params.gateway, params.invoiceId, params.claimToken, invoice);
      return;
    }

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

function stopPolling(): void {
  if (countdownTimer) clearInterval(countdownTimer);
}

function showPollError(message: string): void {
  stopPolling();
  $("error-message").textContent = message;
  showState("error-state");
}

async function poll(
  gateway: string,
  invoiceId: string,
  startedAt: number = Date.now(),
  delay: number = POLL_BASE_MS,
): Promise<void> {
  if (Date.now() - startedAt > POLL_MAX_DURATION_MS) {
    showPollError("Invoice expired or unreachable. Please request a new payment link.");
    return;
  }

  try {
    const invoice = await fetchInvoice(gateway, invoiceId);
    updateStatus(invoice);

    if (invoice.status === "completed") {
      stopPolling();
      setTimeout(() => {
        $("success-detail").textContent = `${formatDero(invoice.amount)} DERO received`;
        showState("success-state");
      }, 1500);
      return;
    }

    if (invoice.status === "expired") {
      stopPolling();
      showState("expired-state");
      return;
    }

    // Success → reset backoff to the base interval.
    setTimeout(() => poll(gateway, invoiceId, startedAt, POLL_BASE_MS), POLL_BASE_MS);
  } catch (err) {
    if (err instanceof DefinitiveError) {
      showPollError(err.message);
      return;
    }
    // Transient error — retry with exponential backoff, capped.
    const next = Math.min(delay * 2, POLL_MAX_MS);
    setTimeout(() => poll(gateway, invoiceId, startedAt, next), delay);
  }
}

$("copy-btn")?.addEventListener("click", async () => {
  const address = $("payment-address").textContent || "";
  await navigator.clipboard.writeText(address);
  const btn = $("copy-btn");
  btn.classList.add("copied");
  setTimeout(() => btn.classList.remove("copied"), 2000);
});

$("escrow-copy-btn")?.addEventListener("click", async () => {
  const scid = $("escrow-scid").textContent || "";
  await navigator.clipboard.writeText(scid);
  const btn = $("escrow-copy-btn");
  btn.classList.add("copied");
  setTimeout(() => btn.classList.remove("copied"), 2000);
});

main();
