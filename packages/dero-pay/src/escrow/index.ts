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

export type { EscrowClaimGuard } from "./manager.js";

export {
  MemoryEscrowClaimGuard,
  SqliteEscrowClaimGuard,
} from "./claim-guard.js";

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
  CreateEscrowQuoteParams,
} from "./types.js";
