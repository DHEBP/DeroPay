/**
 * @module dero-pay/escrow
 *
 * Smart contract-based escrow payment system for DERO.
 *
 * Provides deployment, lifecycle management, and on-chain
 * state tracking for escrow smart contracts.
 */

export {
  EscrowContract,
} from "./contract.js";

export {
  EscrowManager,
} from "./manager.js";

export {
  EscrowStatusCode,
  statusCodeToString,
} from "./types.js";

export type {
  EscrowStatus,
  EscrowStatusCodeValue,
  EscrowOnChainState,
  EscrowRecord,
  EscrowResolution,
  EscrowManagerEvents,
  EscrowManagerConfig,
  CreateEscrowParams,
} from "./types.js";
