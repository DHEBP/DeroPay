/**
 * @module dero-pay/router
 *
 * Smart contract-based instant payment routing for DERO.
 *
 * Provides deployment, payment execution, and on-chain
 * state querying for payment router smart contracts.
 */

export { RouterContract } from "./contract.js";

export { RouterManager } from "./manager.js";

export type {
  RouterOnChainState,
  DeployRouterParams,
  RouterRecord,
  RouterStatus,
  RouterManagerEvents,
  RouterManagerConfig,
} from "./types.js";
