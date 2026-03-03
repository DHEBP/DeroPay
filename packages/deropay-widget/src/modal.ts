import { renderQR } from "./qr.js";
import { getStatus, type InvoiceResponse } from "./api.js";

const POLL_MS = 4000;
const ATOMIC = 100_000;

function formatDero(atomic: string): string {
  return (Number(atomic) / ATOMIC).toFixed(5);
}

export function createModal(
  invoice: InvoiceResponse,
  gateway: string,
  root: ShadowRoot,
  onComplete?: () => void,
  demo?: boolean,
): { destroy: () => void } {
  const overlay = document.createElement("div");
  overlay.className = "dp-overlay";

  const modal = document.createElement("div");
  modal.className = "dp-modal";

  const header = document.createElement("div");
  header.className = "dp-modal-header";
  header.innerHTML = `
    <span class="dp-modal-title">${esc(invoice.name || "Pay with DERO")}</span>
    <button class="dp-close" aria-label="Close">&times;</button>
  `;

  const body = document.createElement("div");
  body.className = "dp-modal-body";

  const qrWrap = document.createElement("div");
  qrWrap.className = "dp-qr";
  renderQR(qrWrap, invoice.integratedAddress, 180);

  const amountRow = document.createElement("div");
  amountRow.className = "dp-amount-row";
  amountRow.innerHTML = `
    <span class="dp-amount-value">${formatDero(invoice.amount)}</span>
    <span class="dp-amount-label">DERO</span>
  `;

  const fiatEl = document.createElement("div");
  fiatEl.className = "dp-fiat";

  const addrLabel = document.createElement("label");
  addrLabel.className = "dp-address-label";
  addrLabel.textContent = "Send to this address:";

  const addrBox = document.createElement("div");
  addrBox.className = "dp-address-box";
  addrBox.innerHTML = `
    <code>${esc(invoice.integratedAddress)}</code>
    <button class="dp-copy" title="Copy address">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
    </button>
  `;

  const statusBar = document.createElement("div");
  statusBar.className = "dp-status";
  statusBar.innerHTML = `<span>⏳</span><span class="dp-status-text">Waiting for payment...</span>`;

  const countdown = document.createElement("div");
  countdown.className = "dp-countdown";

  body.append(qrWrap, amountRow, fiatEl, addrLabel, addrBox, statusBar, countdown);

  const footer = document.createElement("div");
  footer.className = "dp-modal-footer";
  footer.innerHTML = `Powered by <a href="https://deropay.com" target="_blank" rel="noopener">DeroPay</a>`;

  modal.append(header, body, footer);
  overlay.appendChild(modal);
  root.appendChild(overlay);

  const closeBtn = header.querySelector(".dp-close") as HTMLButtonElement;
  closeBtn.addEventListener("click", destroy);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) destroy();
  });

  const copyBtn = addrBox.querySelector(".dp-copy") as HTMLButtonElement;
  copyBtn.addEventListener("click", async () => {
    await navigator.clipboard.writeText(invoice.integratedAddress);
    copyBtn.style.color = "#10b981";
    setTimeout(() => { copyBtn.style.color = ""; }, 2000);
  });

  let pollTimer: number | null = null;
  let countdownTimer: number | null = null;
  let demoTimer1: number | null = null;
  let demoTimer2: number | null = null;
  let destroyed = false;

  function updateCountdown(): void {
    const rem = new Date(invoice.expiresAt).getTime() - Date.now();
    if (rem <= 0) { countdown.textContent = "Expired"; return; }
    const m = Math.floor(rem / 60000);
    const s = Math.floor((rem % 60000) / 1000);
    countdown.textContent = `Expires in ${m}:${s.toString().padStart(2, "0")}`;
  }

  function showSuccess(): void {
    body.innerHTML = "";
    const success = document.createElement("div");
    success.className = "dp-success";
    success.innerHTML = `
      <div class="dp-success-icon">✓</div>
      <h3>Payment Confirmed</h3>
      <p>${formatDero(invoice.amount)} DERO received</p>
    `;
    body.appendChild(success);
    onComplete?.();

    root.host.dispatchEvent(new CustomEvent("deropay:completed", {
      bubbles: true,
      detail: { invoiceId: invoice.id, amount: invoice.amount },
    }));
  }

  function setStatus(status: string, icon: string, text: string, cls?: string): void {
    statusBar.className = cls ? `dp-status ${cls}` : "dp-status";
    statusBar.innerHTML = `<span>${icon}</span><span class="dp-status-text">${text}</span>`;
  }

  async function poll(): Promise<void> {
    if (destroyed) return;
    try {
      const data = await getStatus(gateway, invoice.id);
      Object.assign(invoice, data);

      if (data.status === "confirming") {
        setStatus("confirming", "⛏", "Payment detected — confirming...", "confirming");
      } else if (data.status === "completed") {
        setStatus("completed", "✓", "Payment confirmed!", "completed");
        stopTimers();
        setTimeout(showSuccess, 1200);
        return;
      } else if (data.status === "expired") {
        setStatus("expired", "⏰", "Invoice expired");
        stopTimers();
        return;
      }
    } catch { /* keep polling */ }

    pollTimer = window.setTimeout(poll, POLL_MS);
  }

  function runDemoSequence(): void {
    demoTimer1 = window.setTimeout(() => {
      if (destroyed) return;
      setStatus("confirming", "⛏", "Payment detected — confirming...", "confirming");
      demoTimer2 = window.setTimeout(() => {
        if (destroyed) return;
        setStatus("completed", "✓", "Payment confirmed!", "completed");
        stopTimers();
        setTimeout(showSuccess, 1200);
      }, 3000);
    }, 4000);
  }

  function stopTimers(): void {
    if (pollTimer) clearTimeout(pollTimer);
    if (countdownTimer) clearInterval(countdownTimer);
    if (demoTimer1) clearTimeout(demoTimer1);
    if (demoTimer2) clearTimeout(demoTimer2);
  }

  function destroy(): void {
    destroyed = true;
    stopTimers();
    overlay.remove();
  }

  updateCountdown();
  countdownTimer = window.setInterval(updateCountdown, 1000);

  if (demo) {
    runDemoSequence();
  } else {
    pollTimer = window.setTimeout(poll, POLL_MS);
  }

  return { destroy };
}

function esc(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}
