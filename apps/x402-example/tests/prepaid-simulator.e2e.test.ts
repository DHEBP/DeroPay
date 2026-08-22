import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type TestContext } from "vitest";
import {
  SpendPolicy,
  createPayingFetch,
  createWalletRpcPayer,
  type InvoicePayer,
} from "dero-pay/agent";
import { createPrepaidClient } from "dero-pay/prepaid";
import { WalletRpcClient } from "dero-pay/rpc";
import {
  createAuthToken,
  startFakeProvider,
  startNextApp,
  waitFor,
  type RunningApp,
} from "./prepaid-e2e-harness";

const host = process.env.DERO_SIM_WALLET_HOST ?? "127.0.0.1";
const daemonUrl =
  process.env.DERO_SIM_DAEMON_RPC_URL ?? "http://127.0.0.1:20000/json_rpc";
const walletUrls = Array.from(
  { length: 6 },
  (_, index) => `http://${host}:${30_000 + index}/json_rpc`,
);

const sleep = (milliseconds: number) =>
  new Promise<void>((resolvePromise) => setTimeout(resolvePromise, milliseconds));

async function simulatorWallets(context: TestContext) {
  const clients = walletUrls.map((url) => new WalletRpcClient({ url, timeoutMs: 5_000 }));
  try {
    const snapshots = await Promise.all(
      clients.map(async (client) => ({
        address: await client.getAddress(),
        balance: await client.getBalance(),
      })),
    );
    return { clients, snapshots };
  } catch {
    if (process.env.REQUIRE_DERO_SIMULATOR === "1") {
      throw new Error(
        "DERO simulator is required, but daemon 20000 and wallet RPCs 30000-30005 are not all reachable",
      );
    }
    context.skip();
    return null;
  }
}

function startFinalityPump(source: WalletRpcClient, destination: string) {
  let stopping = false;
  let transfers = 0;
  const task = (async () => {
    while (!stopping) {
      try {
        await source.transfer(destination, 1n, 2);
        transfers++;
      } catch {
        // The simulator wallet can briefly be busy while mining; retrying is sufficient.
      }
      await sleep(250);
    }
  })();
  return {
    count: () => transfers,
    async stop() {
      stopping = true;
      await task;
    },
  };
}

function prepaidWallet(options: {
  appUrl: string;
  address: string;
  token: string;
  wallet: WalletRpcClient;
}) {
  const rpcPayer = createWalletRpcPayer({ client: options.wallet, ringsize: 2 });
  const stats = { payments: 0 };
  const payer: InvoicePayer = async (payment) => {
    stats.payments++;
    return rpcPayer(payment);
  };
  const payingFetch = createPayingFetch({
    payer,
    policy: new SpendPolicy({
      allowOrigins: [options.appUrl],
      maxAtomicPerRequest: 1_000_000n,
      maxAtomicPerWindow: { amountAtomic: 2_000_000n, windowSeconds: 600 },
    }),
    network: "dero-testnet",
    settleTimeoutMs: 180_000,
    settlePollIntervalMs: 500,
    reuseReceipts: false,
  });
  return {
    stats,
    client: createPrepaidClient({
      baseUrl: options.appUrl,
      walletAddress: options.address,
      getAuthToken: () => options.token,
      payingFetch,
    }),
  };
}

function conservedBalance(transactions: {
  items: Array<{ type: "TOP_UP" | "CHARGE" | "REFUND"; amountAtomic: string }>;
}) {
  return transactions.items.reduce(
    (total, item) =>
      total + (item.type === "CHARGE" ? -BigInt(item.amountAtomic) : BigInt(item.amountAtomic)),
    0n,
  );
}

test(
  "six simulator wallets fund isolated prepaid accounts and survive a gateway restart",
  async (context) => {
    const simulator = await simulatorWallets(context);
    if (!simulator) return;

    const [merchant, alice, bob, , finalitySource] = simulator.clients;
    const [merchantOpening, aliceOpening, bobOpening] = simulator.snapshots;
    expect(new Set(simulator.snapshots.map(({ address }) => address)).size).toBe(6);
    expect(aliceOpening.balance.unlocked_balance).toBeGreaterThan(50_000);
    expect(bobOpening.balance.unlocked_balance).toBeGreaterThan(50_000);
    expect(simulator.snapshots[4].balance.unlocked_balance).toBeGreaterThan(1);

    const finality = startFinalityPump(finalitySource, simulator.snapshots[5].address);
    const provider = await startFakeProvider();
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "deropay-prepaid-simulator-"));
    const database = join(temporaryDirectory, "deropay.db");
    const authSecret = randomBytes(32).toString("hex");
    const receiptSecret = randomBytes(32).toString("hex");
    const [aliceToken, bobToken, malloryToken] = await Promise.all([
      createAuthToken(authSecret, simulator.snapshots[1].address),
      createAuthToken(authSecret, simulator.snapshots[2].address),
      createAuthToken(authSecret, simulator.snapshots[3].address),
    ]);
    let app: RunningApp | undefined;

    try {
      const launch = () =>
        startNextApp({
          dbPath: database,
          upstreamBaseUrl: provider.origin,
          authSecret,
          receiptSecret,
          walletRpcUrl: walletUrls[0],
          daemonRpcUrl: daemonUrl,
          redact: [
            ...simulator.snapshots.map(({ address }) => address),
            aliceToken,
            bobToken,
            malloryToken,
          ],
        });
      app = await launch();
      const aliceAgent = prepaidWallet({
        appUrl: app.baseUrl,
        address: simulator.snapshots[1].address,
        token: aliceToken,
        wallet: alice,
      });
      const bobAgent = prepaidWallet({
        appUrl: app.baseUrl,
        address: simulator.snapshots[2].address,
        token: bobToken,
        wallet: bob,
      });

      const [aliceTopUp, bobTopUp] = await Promise.all([
        aliceAgent.client.topUp(50_000n, "simulator-alice-top-up"),
        bobAgent.client.topUp(50_000n, "simulator-bob-top-up"),
      ]);
      expect(aliceTopUp).toMatchObject({
        creditedAtomic: "50000",
        balanceAtomic: "50000",
        created: true,
      });
      expect(bobTopUp).toMatchObject({
        creditedAtomic: "50000",
        balanceAtomic: "50000",
        created: true,
      });
      expect(aliceTopUp.invoiceId).not.toBe(bobTopUp.invoiceId);
      expect(aliceAgent.stats.payments).toBe(1);
      expect(bobAgent.stats.payments).toBe(1);

      expect(
        await aliceAgent.client.topUp(50_000n, "simulator-alice-top-up"),
      ).toMatchObject({ created: false, balanceAtomic: "50000" });
      expect(aliceAgent.stats.payments).toBe(1);

      expect(
        (
          await aliceAgent.client.request(
            `/api/v1/x402/balance/${encodeURIComponent(simulator.snapshots[2].address)}`,
          )
        ).status,
      ).toBe(403);
      const malloryResponse = await fetch(
        `${app.baseUrl}/api/v1/x402/balance/${encodeURIComponent(simulator.snapshots[1].address)}`,
        { headers: { Authorization: `Bearer ${malloryToken}` } },
      );
      expect(malloryResponse.status).toBe(403);

      const inference = (agent: typeof aliceAgent, key: string) =>
        agent.client.request("/api/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": key },
          body: JSON.stringify({ model: "default" }),
        });
      const [aliceInference, bobInference] = await Promise.all([
        inference(aliceAgent, "same-key-two-wallets"),
        inference(bobAgent, "same-key-two-wallets"),
      ]);
      expect([aliceInference.status, bobInference.status]).toEqual([200, 200]);
      expect(await aliceAgent.client.getBalance()).toMatchObject({
        balanceAtomic: "49998",
        reservedAtomic: "0",
      });
      expect(await bobAgent.client.getBalance()).toMatchObject({
        balanceAtomic: "49998",
        reservedAtomic: "0",
      });

      const [aliceTransactions, bobTransactions] = await Promise.all([
        aliceAgent.client.getTransactions({ limit: 100 }),
        bobAgent.client.getTransactions({ limit: 100 }),
      ]);
      expect(conservedBalance(aliceTransactions)).toBe(49_998n);
      expect(conservedBalance(bobTransactions)).toBe(49_998n);
      expect(aliceTransactions.items.find((item: { type: string }) => item.type === "TOP_UP")
        ?.metadata.invoiceId).toBe(aliceTopUp.invoiceId);
      expect(bobTransactions.items.find((item: { type: string }) => item.type === "TOP_UP")
        ?.metadata.invoiceId).toBe(bobTopUp.invoiceId);

      await waitFor(
        () => merchant.getBalance(),
        (balance) => balance.balance >= merchantOpening.balance.balance + 100_000,
        { timeoutMs: 60_000, intervalMs: 500, label: "merchant receiving both top-ups" },
      );
      await waitFor(
        () => alice.getBalance(),
        (balance) => balance.balance < aliceOpening.balance.balance,
        { timeoutMs: 60_000, intervalMs: 500, label: "Alice wallet debit" },
      );
      await waitFor(
        () => bob.getBalance(),
        (balance) => balance.balance < bobOpening.balance.balance,
        { timeoutMs: 60_000, intervalMs: 500, label: "Bob wallet debit" },
      );
      expect(finality.count()).toBeGreaterThan(0);

      const sensitiveValues = [
        authSecret,
        receiptSecret,
        aliceToken,
        bobToken,
        malloryToken,
        ...simulator.snapshots.map(({ address }) => address),
      ];
      for (const value of sensitiveValues) {
        expect(app.containsRawLogValue(value)).toBe(false);
      }
      await app.stop();
      app = await launch();
      const restartedAlice = prepaidWallet({
        appUrl: app.baseUrl,
        address: simulator.snapshots[1].address,
        token: aliceToken,
        wallet: alice,
      });
      expect(
        await restartedAlice.client.topUp(50_000n, "simulator-alice-top-up"),
      ).toMatchObject({ created: false, balanceAtomic: "49998" });
      expect(restartedAlice.stats.payments).toBe(0);
      expect(await restartedAlice.client.getBalance()).toMatchObject({
        balanceAtomic: "49998",
        reservedAtomic: "0",
      });

      for (const value of sensitiveValues) {
        expect(app.containsRawLogValue(value)).toBe(false);
      }
    } finally {
      await app?.stop();
      await provider.stop();
      await finality.stop();
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  },
  300_000,
);
