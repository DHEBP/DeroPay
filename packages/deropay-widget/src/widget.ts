import { CSS } from "./styles.js";
import { createInvoice } from "./api.js";
import { createModal } from "./modal.js";

type WidgetConfig = {
  gateway: string;
  apiKey: string;
  amount?: number;
  fiatAmount?: number;
  currency?: string;
  name?: string;
  callbackUrl?: string;
};

function parseConfig(el: HTMLElement): WidgetConfig | null {
  const gateway = el.dataset.gateway;
  const apiKey = el.dataset.apiKey;
  if (!gateway || !apiKey) return null;

  return {
    gateway: gateway.replace(/\/$/, ""),
    apiKey,
    amount: el.dataset.amount ? Number(el.dataset.amount) : undefined,
    fiatAmount: el.dataset.fiatAmount ? Number(el.dataset.fiatAmount) : undefined,
    currency: el.dataset.currency,
    name: el.dataset.name,
    callbackUrl: el.dataset.callbackUrl,
  };
}

function initElement(el: HTMLElement): void {
  const config = parseConfig(el);
  if (!config) {
    console.warn("[DeroPay] Missing data-gateway or data-api-key on", el);
    return;
  }

  const shadow = el.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = CSS;
  shadow.appendChild(style);

  const btn = document.createElement("button");
  btn.className = "dp-btn";
  btn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
      <path d="M2 17l10 5 10-5"/>
      <path d="M2 12l10 5 10-5"/>
    </svg>
    Pay with DERO
  `;
  shadow.appendChild(btn);

  let loading = false;

  btn.addEventListener("click", async () => {
    if (loading) return;
    loading = true;
    btn.textContent = "Loading...";

    try {
      const invoice = await createInvoice({
        gateway: config.gateway,
        apiKey: config.apiKey,
        amount: config.amount,
        fiatAmount: config.fiatAmount,
        currency: config.currency,
        name: config.name,
        callbackUrl: config.callbackUrl,
      });

      createModal(invoice, config.gateway, shadow, () => {
        el.dispatchEvent(new CustomEvent("deropay:completed", {
          bubbles: true,
          detail: { invoiceId: invoice.id, amount: invoice.amount },
        }));
      });
    } catch (err) {
      console.error("[DeroPay] Failed to create invoice:", err);
      const errDiv = document.createElement("div");
      errDiv.className = "dp-overlay";
      errDiv.innerHTML = `
        <div class="dp-modal">
          <div class="dp-modal-header">
            <span class="dp-modal-title">Error</span>
            <button class="dp-close">&times;</button>
          </div>
          <div class="dp-error">
            <p>${err instanceof Error ? err.message : "Failed to create invoice"}</p>
          </div>
        </div>
      `;
      shadow.appendChild(errDiv);
      errDiv.querySelector(".dp-close")?.addEventListener("click", () => errDiv.remove());
      errDiv.addEventListener("click", (e) => { if (e.target === errDiv) errDiv.remove(); });
    } finally {
      loading = false;
      btn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
        Pay with DERO
      `;
    }
  });
}

function init(): void {
  const elements = document.querySelectorAll<HTMLElement>("[id='deropay-button'], .deropay-button, [data-deropay]");
  elements.forEach(initElement);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
