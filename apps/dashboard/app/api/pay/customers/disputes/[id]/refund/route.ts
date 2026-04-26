import {
  DERO_ADDRESS_RE,
  errorJson,
  isDemoMode,
  json,
  parsePositiveAtomic,
  readJsonBody,
  recordEventBestEffort,
  resolveDashboardStore,
  resolveWalletRpc,
} from "../../../../_lib/local";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  if (!id) return errorJson("invalid_id", "Missing dispute id", 400);
  if (await isDemoMode()) {
    return errorJson("demo_mode", "Dispute refunds are disabled in demo mode", 503);
  }

  const body = await readJsonBody(req);
  if (!body) return errorJson("invalid_body", "Invalid JSON body", 400);

  const destinationAddress =
    typeof body.destinationAddress === "string" ? body.destinationAddress.trim() : "";
  if (!DERO_ADDRESS_RE.test(destinationAddress)) {
    return errorJson("invalid_address", "destinationAddress must be dero1... or deto1...", 400);
  }

  const amount = parsePositiveAtomic(body.amountAtomic);
  if (amount === null) {
    return errorJson("invalid_amount", "amountAtomic must be a positive integer string", 400);
  }

  const [store, walletRpc] = await Promise.all([
    resolveDashboardStore(),
    resolveWalletRpc(),
  ]);
  if (!walletRpc) return errorJson("wallet_not_configured", "Wallet RPC is not configured", 503);
  if (
    !store ||
    typeof store.getDispute !== "function" ||
    typeof store.createPayout !== "function" ||
    typeof store.attachDisputeRefund !== "function"
  ) {
    return errorJson("store_unavailable", "Dispute or payout store is unavailable", 503);
  }

  const existing = store.getDispute(id);
  if (!existing) return errorJson("not_found", `Dispute ${id} not found`, 404);
  if (existing.status === "refunded") {
    return errorJson("already_refunded", "Dispute has already been refunded", 409);
  }

  try {
    const payout = await store.createPayout({
      destinationAddress,
      amountAtomic: amount,
    });
    const dispute = store.attachDisputeRefund(id, { payoutId: payout.id });

    await recordEventBestEffort(store, {
      type: "dispute.refunded",
      invoiceId: dispute.invoiceId,
      payload: {
        disputeId: dispute.id,
        invoiceId: dispute.invoiceId,
        payoutId: payout.id,
        amountAtomic: amount.toString(),
      },
    });

    void (async () => {
      try {
        const txHash = await walletRpc.transfer(destinationAddress, amount);
        await store.markPayoutSent(payout.id, { txHash });
        await recordEventBestEffort(store, {
          type: "payout.sent",
          payload: {
            payoutId: payout.id,
            destinationAddress,
            amountAtomic: amount.toString(),
            txHash,
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await store.markPayoutFailed(payout.id, { error: message });
        await recordEventBestEffort(store, {
          type: "payout.failed",
          payload: {
            payoutId: payout.id,
            destinationAddress,
            amountAtomic: amount.toString(),
            error: message,
          },
        });
      }
    })();

    return json(dispute, { status: 202 });
  } catch (err) {
    return errorJson(
      "refund_failed",
      err instanceof Error ? err.message : "Failed to issue refund",
      500
    );
  }
}
