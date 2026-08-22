/**
 * Budgeted DERO wallet agent for the local simulator.
 *
 * One SpendPolicy is shared by the invoice and smart-contract x402 rails, so
 * neither rail can escape the other's process-local rolling budget.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPayingFetch as createInvoicePayingFetch,
  createWalletRpcPayer,
  SpendPolicy,
  SpendPolicyError,
  X402PaymentRejectedError as InvoicePaymentRejectedError,
  X402SettlementTimeoutError,
  type PaymentEvidence as InvoicePaymentEvidence,
} from "dero-pay/agent";
import { WalletRpcClient } from "dero-pay/rpc";
import {
  createPayingFetch as createContractPayingFetch,
  createWalletRpcInvoke,
  X402PaymentRejectedError as ContractPaymentRejectedError,
  type PaymentEvidence as ContractPaymentEvidence,
} from "dero-pay/x402";

export type PaymentRail = "invoice" | "contract" | "both";
type ActiveRail = Exclude<PaymentRail, "both">;
type AuditableEvidence = Pick<
  InvoicePaymentEvidence | ContractPaymentEvidence,
  "at" | "origin" | "resource" | "amountAtomic" | "txid"
>;

export type AgentConfig = {
  paymentRail: PaymentRail;
  budgetAtomic: bigint;
  maxAtomicPerRequest: bigint;
  budgetWindowSeconds: number;
  walletRpcUrl: string;
  invoiceResourceUrl: string;
  contractResourceUrl: string;
  auditPath: string;
};

export type PaymentAuditRecord = {
  schema: "dero-wallet-budget-agent/v1";
  event: "payment";
  at: string;
  rail: ActiveRail;
  origin: string;
  resource: string;
  amountAtomic: string;
  txid: string;
};

type DenialAuditRecord = {
  schema: "dero-wallet-budget-agent/v1";
  event: "denied";
  at: string;
  rail: ActiveRail;
  origin: string;
  resource: string;
  amountAtomic: string;
  code: string;
};

type PendingPaymentAuditRecord = {
  schema: "dero-wallet-budget-agent/v1";
  event: "payment_pending";
  at: string;
  rail: "invoice";
  origin: string;
  resource: string;
  amountAtomic: string;
  txid: string;
};

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function positiveBigInt(name: string, value: string): bigint {
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`${name} must be a positive integer`);
  return BigInt(value);
}

function positiveInteger(name: string, value: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`${name} must be a positive integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} is too large`);
  return parsed;
}

function localHttpUrl(name: string, value: string): string {
  const url = new URL(value);
  if (!LOCAL_HOSTS.has(url.hostname) || !["http:", "https:"].includes(url.protocol)) {
    throw new Error(`${name} must be an HTTP URL on localhost or loopback`);
  }
  if (url.username || url.password) throw new Error(`${name} must not contain credentials`);
  return url.toString();
}

export function loadAgentConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const paymentRail = env.PAYMENT_RAIL ?? "both";
  if (!(["invoice", "contract", "both"] as string[]).includes(paymentRail)) {
    throw new Error("PAYMENT_RAIL must be invoice, contract, or both");
  }

  const auditPath = env.PAYMENT_AUDIT_PATH ?? ".wallet-agent/payments.jsonl";
  if (!auditPath.trim()) throw new Error("PAYMENT_AUDIT_PATH must not be empty");

  return {
    paymentRail: paymentRail as PaymentRail,
    budgetAtomic: positiveBigInt("BUDGET_ATOMIC", env.BUDGET_ATOMIC ?? "100000"),
    maxAtomicPerRequest: positiveBigInt(
      "MAX_ATOMIC_PER_REQUEST",
      env.MAX_ATOMIC_PER_REQUEST ?? "50000",
    ),
    budgetWindowSeconds: positiveInteger(
      "BUDGET_WINDOW_SECONDS",
      env.BUDGET_WINDOW_SECONDS ?? "3600",
    ),
    walletRpcUrl: localHttpUrl(
      "AGENT_WALLET_RPC_URL",
      env.AGENT_WALLET_RPC_URL ?? "http://127.0.0.1:30001/json_rpc",
    ),
    invoiceResourceUrl: localHttpUrl(
      "INVOICE_RESOURCE_URL",
      env.INVOICE_RESOURCE_URL ??
        "http://localhost:3002/api/protected/inference?tokens=10",
    ),
    contractResourceUrl: localHttpUrl(
      "CONTRACT_RESOURCE_URL",
      env.CONTRACT_RESOURCE_URL ?? "http://localhost:3002/api/data",
    ),
    auditPath: resolve(auditPath),
  };
}

export function toPaymentAuditRecord(
  rail: ActiveRail,
  evidence: AuditableEvidence,
): PaymentAuditRecord {
  return {
    schema: "dero-wallet-budget-agent/v1",
    event: "payment",
    at: evidence.at,
    rail,
    origin: evidence.origin,
    resource: evidence.resource,
    amountAtomic: evidence.amountAtomic,
    txid: evidence.txid,
  };
}

function appendAudit(
  path: string,
  record: PaymentAuditRecord | DenialAuditRecord | PendingPaymentAuditRecord,
): void {
  appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
}

export async function runWalletBudgetAgent(config: AgentConfig): Promise<void> {
  mkdirSync(dirname(config.auditPath), { recursive: true });
  appendFileSync(config.auditPath, "", "utf8");

  const policy = new SpendPolicy({
    allowOrigins: [
      new URL(config.invoiceResourceUrl).origin,
      new URL(config.contractResourceUrl).origin,
    ],
    maxAtomicPerRequest: config.maxAtomicPerRequest,
    maxAtomicPerWindow: {
      amountAtomic: config.budgetAtomic,
      windowSeconds: config.budgetWindowSeconds,
    },
  });
  const wallet = new WalletRpcClient({ url: config.walletRpcUrl });
  const opening = await wallet.getBalance();
  let auditFailure: Error | undefined;
  let completed = 0;

  const recordPayment = (rail: ActiveRail, evidence: AuditableEvidence) => {
    try {
      appendAudit(config.auditPath, toPaymentAuditRecord(rail, evidence));
    } catch (error) {
      auditFailure = error instanceof Error ? error : new Error(String(error));
    }
  };

  const invoiceFetch = createInvoicePayingFetch({
    payer: createWalletRpcPayer({ url: config.walletRpcUrl }),
    policy,
    reuseReceipts: false,
    onPayment: (evidence) => recordPayment("invoice", evidence),
  });
  const contractFetch = createContractPayingFetch({
    walletInvoke: createWalletRpcInvoke({ url: config.walletRpcUrl }),
    policy,
    onPayment: (evidence) => recordPayment("contract", evidence),
  });
  const calls: Array<{
    rail: ActiveRail;
    url: string;
    request: () => Promise<Response>;
  }> = [];

  if (config.paymentRail !== "contract") {
    calls.push({
      rail: "invoice",
      url: config.invoiceResourceUrl,
      request: () => invoiceFetch(config.invoiceResourceUrl),
    });
  }
  if (config.paymentRail !== "invoice") {
    calls.push({
      rail: "contract",
      url: config.contractResourceUrl,
      request: () => contractFetch(config.contractResourceUrl),
    });
  }

  console.log(
    `[wallet] opening balance=${opening.balance} unlocked=${opening.unlocked_balance} atomic`,
  );
  console.log(
    `[budget] rail=${config.paymentRail} cap=${config.budgetAtomic} ` +
      `perRequest=${config.maxAtomicPerRequest} window=${config.budgetWindowSeconds}s`,
  );

  try {
    budgetLoop: for (;;) {
      for (const call of calls) {
        const before = policy.spentInWindow();
        let response!: Response;
        let settlementRetries = 0;
        let pendingAudited = false;
        for (;;) {
          try {
            response = await call.request();
            break;
          } catch (error) {
            if (error instanceof X402SettlementTimeoutError) {
              if (!pendingAudited) {
                const paidAtomic = policy.spentInWindow() - before;
                try {
                  appendAudit(config.auditPath, {
                    schema: "dero-wallet-budget-agent/v1",
                    event: "payment_pending",
                    at: new Date().toISOString(),
                    rail: "invoice",
                    origin: error.origin,
                    resource: error.resource,
                    amountAtomic: paidAtomic.toString(),
                    txid: error.txid,
                  });
                } catch (auditError) {
                  console.error("[audit] could not record pending payment:", auditError);
                }
                pendingAudited = true;
              }
              if (error.reason === "deadline" && settlementRetries++ === 0) {
                console.log(
                  `[agent] invoice settlement still pending for tx ${error.txid}; ` +
                    "retrying the same invoice without another wallet payment",
                );
                continue;
              }
              throw error;
            }
            if (!(error instanceof SpendPolicyError)) throw error;
            try {
              appendAudit(config.auditPath, {
                schema: "dero-wallet-budget-agent/v1",
                event: "denied",
                at: new Date().toISOString(),
                rail: call.rail,
                origin: error.origin,
                resource: call.url,
                amountAtomic: error.amountAtomic.toString(),
                code: error.code,
              });
            } catch (auditError) {
              console.error("[audit] could not record policy denial:", auditError);
            }
            console.log(`[budget] stopped before wallet call (${error.code}): ${error.message}`);
            break budgetLoop;
          }
        }

        if (auditFailure) {
          throw new Error(`payment succeeded but audit write failed: ${auditFailure.message}`);
        }
        if (!response.ok) {
          throw new Error(`${call.rail} resource returned HTTP ${response.status} after payment`);
        }
        const after = policy.spentInWindow();
        if (after <= before) {
          throw new Error(`${call.rail} resource returned without charging; refusing an unbounded loop`);
        }
        completed++;
        console.log(`[inference:${call.rail}] ${await response.text()}`);
      }
    }
  } finally {
    try {
      const closing = await wallet.getBalance();
      console.log(
        `[wallet] closing balance=${closing.balance} unlocked=${closing.unlocked_balance} atomic`,
      );
      console.log(
        `[summary] calls=${completed} purchased=${policy.spentInWindow()} atomic ` +
          `walletDelta=${opening.balance - closing.balance} atomic (delta includes network fees)`,
      );
    } catch (error) {
      console.error("[wallet] could not read closing balance:", error);
    }
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  runWalletBudgetAgent(loadAgentConfig()).catch((error) => {
    if (error instanceof X402SettlementTimeoutError) {
      console.error(
        `[agent] invoice ${error.invoiceId} remains pending as ${error.txid}; no second payment was made`,
      );
    } else if (
      error instanceof InvoicePaymentRejectedError ||
      error instanceof ContractPaymentRejectedError
    ) {
      console.error(`[agent] paid tx ${error.txid}, but access failed; refusing to pay again`);
    } else {
      console.error("[agent] failed:", error);
    }
    process.exitCode = 1;
  });
}
