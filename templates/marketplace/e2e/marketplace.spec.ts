import { expect, test } from "@playwright/test";

function orderIdFromUrl(pageUrl: string): string {
  return new URL(pageUrl).pathname.split("/").filter(Boolean).at(-1) ?? "";
}

async function triggerDevWebhook(page: import("@playwright/test").Page, orderId: string, name: string) {
  await page.goto("/dev");
  const card = page.locator(`article[data-order-id="${orderId}"]`);
  await expect(card).toBeVisible();
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes(`/api/dev/orders/${orderId}/webhook`) &&
      response.request().method() === "POST"
    ),
    card.getByRole("button", { name }).click(),
  ]);
}

async function createOrderFromHome(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByTitle("Add to cart").first().click();
  await page.getByRole("link", { name: "Open cart and checkout", exact: true }).click();
  await page.getByRole("button", { name: "Create DeroPay invoice" }).click();
  await expect(page).toHaveURL(/\/orders\/ord_/);
  return orderIdFromUrl(page.url());
}

test("buyer can create and complete a DeroPay invoice order", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Marketplace" })).toBeVisible();
  await page.getByTitle("Add to cart").first().click();
  await page.getByRole("link", { name: "Open cart and checkout", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Checkout", exact: true })).toBeVisible();
  await page.getByLabel("Buyer alias").fill("cipher-buyer");
  await page.getByLabel("Contact handle").fill("@cipher-buyer");
  await page.getByLabel("Shipping address").fill("123 Privacy Way, Austin, TX");
  await page.getByRole("button", { name: "Create DeroPay invoice" }).click();

  await expect(page).toHaveURL(/\/orders\/ord_/);
  const orderId = orderIdFromUrl(page.url());
  await expect(page.getByText("Awaiting payment").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Invoice payment" })).toBeVisible();
  await expect(page.getByText("123 Privacy Way, Austin, TX")).toBeVisible();

  await triggerDevWebhook(page, orderId, "Detect payment");
  await triggerDevWebhook(page, orderId, "Confirm payment");
  await triggerDevWebhook(page, orderId, "Complete invoice");
  await page.goto(`/orders/${orderId}`);
  await expect(page.getByText("Escrow funded").first()).toBeVisible();
});

test("buyer can save a listing and filter saved items", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Save listing" }).first().click();
  await expect(page.getByRole("heading", { name: "Saved listings" })).toBeVisible();
  await page.getByRole("button", { name: "View saved" }).click();
  await expect(page.getByText("active listings - Saved")).toBeVisible();
  await expect(page.locator(".product-grid").getByText("Saved").first()).toBeVisible();
  await page.getByRole("button", { name: "Remove from saved" }).first().click();
});

test("marketplace trust filters narrow the catalog", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Marketplace confidence")).toBeVisible();
  await expect(page.getByText("Protected checkout")).toBeVisible();
  await page.getByRole("button", { name: "Low stock" }).click();
  await expect(page.locator(".product-grid").getByText("Miner Tuning Session")).toBeVisible();
  await expect(page.locator(".product-grid").getByText("DERO Node Kit")).toHaveCount(0);
  await page.getByRole("button", { name: "Instant or digital" }).click();
  await expect(page.locator(".product-grid").getByText("Gateway Storefront Theme")).toBeVisible();
});

test("listing detail shows a professional buy box", async ({ page }) => {
  await page.goto("/listing/dero-node-kit");
  await expect(page.getByRole("heading", { name: "Purchase box" })).toBeVisible();
  await expect(page.getByText("Pay exact invoice")).toBeVisible();
  await expect(page.getByText("8170 sales")).toBeVisible();
  await expect(page.getByText("Escrow default")).toBeVisible();
  await expect(page.getByText("Protected purchase")).toBeVisible();
  await page.getByRole("button", { name: "Save listing" }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
});

test("seller can publish a local listing", async ({ page }, testInfo) => {
  const title = `Private checkout checklist ${testInfo.project.name} ${Date.now()}`;
  await page.goto("/sell");
  await page.getByRole("textbox", { name: "Title", exact: true }).fill(title);
  await page.getByRole("textbox", { name: "Subtitle", exact: true }).fill("Operational checklist for DERO marketplace sellers");
  await page.getByLabel("Price DERO").fill("12");
  await page.getByLabel("Stock").fill("25");
  await page.getByRole("button", { name: "Publish listing" }).click();
  await expect(page.getByText(`${title} is live`)).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
});

test("buyer can release escrow after fulfillment evidence", async ({ page }) => {
  const orderId = await createOrderFromHome(page);

  await triggerDevWebhook(page, orderId, "Detect payment");
  await triggerDevWebhook(page, orderId, "Confirm payment");
  await triggerDevWebhook(page, orderId, "Complete invoice");
  await page.goto("/dev");
  const devCard = page.locator(`article[data-order-id="${orderId}"]`);
  await expect(devCard).toBeVisible();
  for (let index = 0; index < 3; index += 1) {
    await Promise.all([
      page.waitForResponse((response) =>
        response.url().includes(`/api/orders/${orderId}/fulfillment`) &&
        response.request().method() === "POST"
      ),
      devCard.getByRole("button", { name: "Advance fulfillment" }).click(),
    ]);
  }

  await page.goto(`/orders/${orderId}`);
  await expect(page.getByText("Delivered - action needed").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Delivery evidence" })).toBeVisible();
  await page.getByRole("button", { name: "Release escrow" }).click();
  await expect(page.getByText("Completed").first()).toBeVisible();
});

test("buyer can open marketplace review from order help", async ({ page }) => {
  const orderId = await createOrderFromHome(page);
  await triggerDevWebhook(page, orderId, "Detect payment");
  await triggerDevWebhook(page, orderId, "Confirm payment");
  await triggerDevWebhook(page, orderId, "Complete invoice");
  await page.goto(`/orders/${orderId}`);
  await expect(page.getByRole("heading", { name: "Help with this order" })).toBeVisible();
  await page.getByRole("button", { name: "Wrong item" }).click();
  await page.getByPlaceholder("Add details for marketplace review").fill("Serial number did not match");
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes(`/api/orders/${orderId}/dispute`) &&
      response.request().method() === "POST"
    ),
    page.getByRole("button", { name: "Open marketplace review" }).click(),
  ]);
  const helpPanel = page.locator("section").filter({ hasText: "Help with this order" });
  await expect(helpPanel.getByText("Dispute open")).toBeVisible();
  await expect(helpPanel.getByText("Serial number did not match").first()).toBeVisible();
});

test("buyer sees partial payment and invoice expiry states without dev controls", async ({ page }) => {
  const orderId = await createOrderFromHome(page);

  await expect(page.getByText("Dev payment controls")).toHaveCount(0);
  await triggerDevWebhook(page, orderId, "Partial payment");
  await page.goto(`/orders/${orderId}`);
  await expect(page.getByText("Payment incomplete").first()).toBeVisible();
  await triggerDevWebhook(page, orderId, "Expire invoice");
  await page.goto(`/orders/${orderId}`);
  await expect(page.getByText("Invoice expired").first()).toBeVisible();
});

test("seller console shows local funded orders in the action queue", async ({ page }, testInfo) => {
  const title = `Seller queue ${testInfo.project.name} ${Date.now()}`;
  await page.goto("/sell");
  await page.getByRole("textbox", { name: "Title", exact: true }).fill(title);
  await page.getByRole("textbox", { name: "Subtitle", exact: true }).fill("Seller-owned checkout item for fulfillment queue");
  await page.getByLabel("Price DERO").fill("16");
  await page.getByLabel("Stock").fill("9");
  await page.getByRole("button", { name: "Publish listing" }).click();
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("button", { name: "Buy with DERO" }).click();
  await expect(page.getByRole("heading", { name: "Checkout", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create DeroPay invoice" }).click();
  await expect(page).toHaveURL(/\/orders\/ord_/);
  const orderId = orderIdFromUrl(page.url());

  await triggerDevWebhook(page, orderId, "Detect payment");
  await triggerDevWebhook(page, orderId, "Confirm payment");
  await triggerDevWebhook(page, orderId, "Complete invoice");
  await page.goto("/sell");
  await expect(page.getByRole("heading", { name: "Seller standards" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Action required" })).toBeVisible();
  await expect(page.getByText(title)).toBeVisible();
  const queueCard = page.locator("article").filter({ hasText: title }).first();
  await expect(queueCard.getByText("Accept the funded order")).toBeVisible();
  await expect(queueCard.getByRole("button", { name: "Advance" })).toBeVisible();
});

test("DERO Acquire page explains funding is separate from checkout", async ({ page }) => {
  await page.goto("/acquire");
  await expect(page.getByRole("heading", { name: "DERO Acquire" })).toBeVisible();
  await expect(page.getByText("Not a live onramp")).toBeVisible();
  await expect(page.getByText("Already have DERO")).toBeVisible();
  await expect(page.getByText("Exchange route")).toBeVisible();
  await expect(page.getByText("Bridge asset route")).toBeVisible();
});

test("DeroBay reveal presents the Fantastic 8 audit", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Reveal" }).click();
  await expect(page).toHaveURL(/\/reveal/);
  await expect(page.getByRole("heading", { name: /DeroBay is a DERO-native marketplace/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reveal pillars" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fantastic 8 grades" })).toBeVisible();
  await expect(page.getByText("80/80 complete").first()).toBeVisible();
  await expect(page.getByText("not production custody, compliance, or live onramp certification")).toBeVisible();
  await expect(page.getByRole("heading", { name: "eBay-inspired standards" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fantastic 8 audit panel" })).toBeVisible();

  for (const pillar of ["Hook", "Foundation", "Action", "Intelligence", "Safety Net", "Result"]) {
    await expect(page.getByRole("heading", { name: pillar })).toBeVisible();
  }

  for (const persona of [
    "DEVIL'S ADVOCATE",
    "BLACK-HAT AUDITOR",
    "PRAGMATIC ENGINEER",
    "SPATIAL ARCHITECT",
    "DATA SCIENTIST",
    "STATE HISTORIAN",
    "STYLIST",
    "DEBLOATER",
  ]) {
    await expect(page.getByText(persona)).toBeVisible();
  }
});
