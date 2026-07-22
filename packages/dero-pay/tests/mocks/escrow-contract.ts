import { vi } from "vitest";
import type { EscrowContract } from "../../src/escrow/contract.js";
import type { EscrowOnChainState } from "../../src/escrow/types.js";

export type MockEscrowContract = {
  [K in keyof EscrowContract]: ReturnType<typeof vi.fn>;
};

const defaultOnChainState: EscrowOnChainState = {
  scid: "sc-abc123",
  statusCode: 0,
  status: "awaiting_deposit",
  owner: "dero1qowner...",
  seller: "dero1qseller...",
  buyer: null,
  arbitrator: "dero1qarbitrator...",
  feeBasisPoints: 250,
  blockExpiration: 60,
  expectedAmount: 10000,
  escrowBalance: 0,
  depositHeight: null,
  disputeHeight: null,
  arbitrateResult: null,
  paused: false,
  pendingOwner: null,
  scBalance: 0,
};

export function createMockEscrowContract(
  overrides: Partial<Record<keyof EscrowContract, unknown>> = {}
): MockEscrowContract {
  return {
    getSource: vi.fn().mockReturnValue("Function Initialize() ..."),
    deploy: vi.fn().mockResolvedValue("sc-deploy-txid-001"),
    bind: vi.fn().mockResolvedValue("tx-bind-001"),
    deposit: vi.fn().mockResolvedValue("tx-deposit-001"),
    confirmDelivery: vi.fn().mockResolvedValue("tx-confirm-001"),
    refundBuyer: vi.fn().mockResolvedValue("tx-refund-001"),
    claimAfterExpiry: vi.fn().mockResolvedValue("tx-claim-001"),
    dispute: vi.fn().mockResolvedValue("tx-dispute-001"),
    arbitrate: vi.fn().mockResolvedValue("tx-arbitrate-001"),
    refundAfterDisputeTimeout: vi.fn().mockResolvedValue("tx-timeout-refund-001"),
    pause: vi.fn().mockResolvedValue("tx-pause-001"),
    unpause: vi.fn().mockResolvedValue("tx-unpause-001"),
    getState: vi.fn().mockResolvedValue({ ...defaultOnChainState }),
    exists: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as MockEscrowContract;
}

export { defaultOnChainState };
