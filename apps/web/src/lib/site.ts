/**
 * Canonical external link constants — single source of truth.
 *
 * These are the only place URLs to the repo, npm, docs, demo, checkout, and
 * dashboard are defined. Going public (or moving a host) is a one-line change
 * here, not a codebase-wide find-and-replace.
 */

/** GitHub repo — every View Source / Clone / View Contracts link. */
export const REPO_URL = "https://github.com/DHEBP/dero-pay";

/** npm package page. */
export const NPM_URL = "https://www.npmjs.com/package/dero-pay";

/** Hosted documentation. */
export const DOCS_URL = "https://deropay.derod.org";

/** Live product demo. */
export const DEMO_URL = "https://demo.deropay.com";

/** Hosted checkout page (demo mode). */
export const CHECKOUT_URL = "https://checkout.deropay.com/?demo=true";

/** Self-hosted merchant dashboard demo. */
export const DASHBOARD_URL = "https://dashboard.deropay.com";
