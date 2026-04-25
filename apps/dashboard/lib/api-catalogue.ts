/**
 * Phase 3 #36 — API Playground catalogue.
 *
 * A curated, hand-maintained list of the DeroPay merchant-admin endpoints
 * the interactive shell can drive. This is deliberately *not* auto-generated
 * from the App Router filesystem: the tree has subtle shape differences
 * (proxied `[[...path]]` handlers, static methods defined behind `const`
 * assignments, etc.) and a static manifest gives us room to add descriptions,
 * example bodies, and pre-seeded example runs without runtime introspection.
 *
 * Keep this file in lockstep with new routes under `apps/dashboard/app/api/pay/*`.
 */

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type QueryParamSpec = {
  name: string;
  description: string;
  type: "string" | "number";
  default?: string;
};

export type ApiEndpoint = {
  id: string;
  method: HttpMethod;
  path: string; // e.g. "/api/pay/invoices/:id"
  group: string; // "Invoices", "Escrows", "Events", "Webhooks", ...
  description: string;
  /** Names of `:param` segments in `path`, rendered as inputs. */
  pathParams?: string[];
  queryParams?: QueryParamSpec[];
  /** JSON example as a string, pre-filled in the body textarea. */
  bodySchema?: string;
  /** If true, shell requires an explicit "I know what I'm doing" confirm. */
  destructive?: boolean;
};

export type ExampleRun = {
  id: string;
  label: string;
  description: string;
  endpointId: string;
  /** Pre-fills query/body/path inputs when the user clicks the chip. */
  queryValues?: Record<string, string>;
  pathValues?: Record<string, string>;
  body?: string;
};

// ---------------------------------------------------------------------------
// Endpoints — grouped by surface area in the dashboard.
// ---------------------------------------------------------------------------

export const API_CATALOGUE: ApiEndpoint[] = [
  // ------------------------------- Invoices ------------------------------- //
  {
    id: "list-invoices",
    method: "GET",
    path: "/api/pay/invoices",
    group: "Invoices",
    description: "List invoices newest-first, optionally filtered by state.",
    queryParams: [
      { name: "limit", description: "Max results (1–100)", type: "number", default: "20" },
      { name: "offset", description: "Pagination offset", type: "number", default: "0" },
      {
        name: "state",
        description: "pending | paid | expired | cancelled",
        type: "string",
      },
    ],
  },
  {
    id: "create-invoice",
    method: "POST",
    path: "/api/pay/create",
    group: "Invoices",
    description: "Create a new invoice. Returns the invoice + hosted checkout URL.",
    bodySchema: `{
  "name": "Order #1001",
  "amount": "1.25",
  "currency": "DERO",
  "description": "Widget bundle",
  "expiresIn": 3600
}`,
  },
  {
    id: "get-invoice-status",
    method: "GET",
    path: "/api/pay/status",
    group: "Invoices",
    description: "Get the current payment state of an invoice by ID.",
    queryParams: [
      { name: "invoiceId", description: "Invoice ID (required)", type: "string" },
    ],
  },
  {
    id: "get-invoice",
    method: "GET",
    path: "/api/pay/invoices/:id",
    group: "Invoices",
    description: "Fetch the full invoice record including line items and metadata.",
    pathParams: ["id"],
  },
  {
    id: "update-invoice",
    method: "PATCH",
    path: "/api/pay/invoices/:id",
    group: "Invoices",
    description: "Patch invoice fields (description, metadata, state transitions).",
    pathParams: ["id"],
    bodySchema: `{
  "description": "Updated description",
  "metadata": {
    "orderRef": "ORD-4821"
  }
}`,
  },

  // -------------------------------- Escrows ------------------------------- //
  {
    id: "list-escrows",
    method: "GET",
    path: "/api/pay/escrows",
    group: "Escrows",
    description: "List escrow contracts visible to this merchant.",
    queryParams: [
      { name: "limit", description: "Max results", type: "number", default: "20" },
      {
        name: "state",
        description: "funded | released | refunded | disputed",
        type: "string",
      },
    ],
  },
  {
    id: "escrow-action",
    method: "POST",
    path: "/api/pay/escrow",
    group: "Escrows",
    description:
      "Perform an escrow action: release, refund, or open a dispute. The `action` field selects the operation.",
    bodySchema: `{
  "action": "release",
  "escrowId": "esc_...",
  "reason": "Buyer confirmed delivery"
}`,
  },

  // -------------------------------- Events -------------------------------- //
  {
    id: "list-events",
    method: "GET",
    path: "/api/pay/events",
    group: "Events",
    description:
      "Stream the merchant event feed. Tip: send `Accept: text/event-stream` for the SSE branch (not exercised by this shell).",
    queryParams: [
      { name: "limit", description: "Max results", type: "number", default: "50" },
      {
        name: "state",
        description: "unread | done | snoozed | all",
        type: "string",
        default: "all",
      },
      { name: "type", description: "Filter by event type (e.g. invoice.paid)", type: "string" },
    ],
  },
  {
    id: "update-events",
    method: "PATCH",
    path: "/api/pay/events",
    group: "Events",
    description: "Bulk-mutate events: mark read, snooze, or complete.",
    bodySchema: `{
  "ids": ["evt_..."],
  "action": "read"
}`,
  },

  // ------------------------------ Webhooks -------------------------------- //
  {
    id: "list-deliveries",
    method: "GET",
    path: "/api/pay/webhooks/deliveries",
    group: "Webhooks",
    description: "List outbound webhook delivery attempts with status & payload.",
    queryParams: [
      { name: "limit", description: "Max results (1–200)", type: "number", default: "100" },
      { name: "status", description: "delivered | failed | pending", type: "string" },
    ],
  },
  {
    id: "get-delivery",
    method: "GET",
    path: "/api/pay/webhooks/deliveries/:id",
    group: "Webhooks",
    description: "Fetch a single delivery with its full request/response capture.",
    pathParams: ["id"],
  },
  {
    id: "resend-delivery",
    method: "POST",
    path: "/api/pay/webhooks/deliveries/:id/resend",
    group: "Webhooks",
    description:
      "Resend a delivery using the currently active signing secret. Fails with 410 after the 15-day window.",
    pathParams: ["id"],
  },
  {
    id: "list-signing-secrets",
    method: "GET",
    path: "/api/pay/webhooks/secrets",
    group: "Webhooks",
    description: "List active + retiring webhook signing secrets.",
  },
  {
    id: "rotate-signing-secret",
    method: "POST",
    path: "/api/pay/webhooks/secrets/rotate",
    group: "Webhooks",
    description:
      "Mint a new signing secret. The previous secret remains valid for 24 hours so receivers can cut over.",
    destructive: true,
  },
  {
    id: "revoke-signing-secret",
    method: "POST",
    path: "/api/pay/webhooks/secrets/:id/revoke",
    group: "Webhooks",
    description:
      "Immediately revoke a retiring secret — any in-flight deliveries signed with it will fail verification.",
    pathParams: ["id"],
    destructive: true,
  },

  // ----------------------------- Customers -------------------------------- //
  {
    id: "update-customer",
    method: "PATCH",
    path: "/api/pay/customers/:id",
    group: "Customers",
    description: "Patch a customer profile (notes, tags, contact fields).",
    pathParams: ["id"],
    bodySchema: `{
  "notes": "VIP — prioritize support tickets",
  "tags": ["vip", "pro-plan"]
}`,
  },
  {
    id: "list-customer-groups-for-customer",
    method: "GET",
    path: "/api/pay/customers/:id/groups",
    group: "Customers",
    description: "List every customer-group this customer belongs to.",
    pathParams: ["id"],
  },

  // -------------------------- Customer groups ----------------------------- //
  {
    id: "list-customer-groups",
    method: "GET",
    path: "/api/pay/customer-groups",
    group: "Customer groups",
    description: "List customer groups (segments) for this merchant.",
    queryParams: [
      { name: "limit", description: "Max results", type: "number", default: "50" },
    ],
  },
  {
    id: "create-customer-group",
    method: "POST",
    path: "/api/pay/customer-groups",
    group: "Customer groups",
    description: "Create a new customer group.",
    bodySchema: `{
  "name": "High-LTV",
  "description": "Customers with > 10 DERO lifetime spend",
  "color": "#b85b3a"
}`,
  },
  {
    id: "get-customer-group",
    method: "GET",
    path: "/api/pay/customer-groups/:id",
    group: "Customer groups",
    description: "Get a single customer group with member count.",
    pathParams: ["id"],
  },
  {
    id: "update-customer-group",
    method: "PATCH",
    path: "/api/pay/customer-groups/:id",
    group: "Customer groups",
    description: "Rename or re-color a group.",
    pathParams: ["id"],
    bodySchema: `{
  "name": "New name",
  "description": "Updated description"
}`,
  },
  {
    id: "delete-customer-group",
    method: "DELETE",
    path: "/api/pay/customer-groups/:id",
    group: "Customer groups",
    description: "Delete a customer group. Memberships are removed; customer records are untouched.",
    pathParams: ["id"],
    destructive: true,
  },
  {
    id: "add-group-member",
    method: "POST",
    path: "/api/pay/customer-groups/:id/members",
    group: "Customer groups",
    description: "Add a customer to a group.",
    pathParams: ["id"],
    bodySchema: `{
  "customerId": "cus_..."
}`,
  },
  {
    id: "remove-group-member",
    method: "DELETE",
    path: "/api/pay/customer-groups/:id/members",
    group: "Customer groups",
    description: "Remove a customer from a group. Pass `customerId` as a query param.",
    pathParams: ["id"],
    queryParams: [
      { name: "customerId", description: "Customer to remove", type: "string" },
    ],
    destructive: true,
  },

  // -------------------------- Products / links ---------------------------- //
  {
    id: "list-products",
    method: "GET",
    path: "/api/pay/products",
    group: "Products & links",
    description: "List payment links / products.",
    queryParams: [
      { name: "limit", description: "Max results", type: "number", default: "20" },
    ],
  },
  {
    id: "create-product",
    method: "POST",
    path: "/api/pay/products",
    group: "Products & links",
    description: "Create a payment link / product.",
    bodySchema: `{
  "name": "Pro Plan",
  "amount": "9.99",
  "currency": "DERO",
  "description": "Monthly subscription"
}`,
  },
  {
    id: "delete-product",
    method: "DELETE",
    path: "/api/pay/products/:id",
    group: "Products & links",
    description: "Delete a payment link. Existing in-flight checkouts are unaffected.",
    pathParams: ["id"],
    destructive: true,
  },

  // --------------------------- Health / stats ----------------------------- //
  {
    id: "health",
    method: "GET",
    path: "/api/pay/health",
    group: "Observability",
    description: "Lightweight readiness check for the gateway + wallet daemon.",
  },
  {
    id: "stats",
    method: "GET",
    path: "/api/pay/stats",
    group: "Observability",
    description: "KPI rollups: volume, invoice counts, conversion, over a window.",
    queryParams: [
      {
        name: "window",
        description: "24h | 7d | 30d | 90d",
        type: "string",
        default: "7d",
      },
    ],
  },

  // ----------------------------- Metadata --------------------------------- //
  {
    id: "update-metadata",
    method: "PATCH",
    path: "/api/pay/metadata",
    group: "Metadata",
    description: "Patch merchant-level metadata (brand profile, defaults).",
    bodySchema: `{
  "brandName": "Example Co.",
  "accentColor": "#c39a4e"
}`,
  },

  // -------------------------- Atomic swaps -------------------------------- //
  {
    id: "list-atomic-swaps",
    method: "GET",
    path: "/api/pay/atomic-swaps",
    group: "Atomic swaps",
    description: "List active + historical atomic-swap proposals.",
  },
];

// ---------------------------------------------------------------------------
// Example runs — pre-seeded shortcuts for the shell's "Example requests" chips.
// ---------------------------------------------------------------------------

export const API_EXAMPLES: ExampleRun[] = [
  {
    id: "example-pending-invoices",
    label: "List pending invoices",
    description: "Last 10 invoices stuck in `pending`",
    endpointId: "list-invoices",
    queryValues: { limit: "10", state: "pending" },
  },
  {
    id: "example-recent-events",
    label: "Recent events",
    description: "Last 25 merchant events",
    endpointId: "list-events",
    queryValues: { limit: "25", state: "all" },
  },
  {
    id: "example-deliveries-24h",
    label: "Webhook deliveries",
    description: "Last 100 outbound webhook attempts",
    endpointId: "list-deliveries",
    queryValues: { limit: "100" },
  },
];

// ---------------------------------------------------------------------------
// Derived lookups — cheap enough to build on every render.
// ---------------------------------------------------------------------------

export function groupedEndpoints(): Array<{ group: string; endpoints: ApiEndpoint[] }> {
  const map = new Map<string, ApiEndpoint[]>();
  for (const ep of API_CATALOGUE) {
    const list = map.get(ep.group) ?? [];
    list.push(ep);
    map.set(ep.group, list);
  }
  return Array.from(map.entries()).map(([group, endpoints]) => ({ group, endpoints }));
}

export function findEndpoint(id: string): ApiEndpoint | undefined {
  return API_CATALOGUE.find((ep) => ep.id === id);
}
