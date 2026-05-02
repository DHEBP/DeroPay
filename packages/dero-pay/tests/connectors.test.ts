import { describe, expect, it, vi } from "vitest";
import {
  WalletConnectorError,
  assertSpendOperationsAllowed,
  createWalletConnector,
  defaultWalletConnectorPolicy,
  mapRawWalletErrorCode,
  normalizeWalletConnectorError,
  probeWasmWebwalletBridge,
  type WasmWebwalletBridge,
} from "../src/client/connectors/index.js";
import { mapTransferRequest } from "../src/client/connectors/xswd/xswd-mapper.js";
import { WasmWebwalletConnector } from "../src/client/connectors/wasm/WasmWebwalletConnector.js";

describe("wallet connector factory", () => {
  it("defaults to XSWD and does not silently select WASM", async () => {
    const wasmBridge: WasmWebwalletBridge = {
      getAddress: vi.fn().mockResolvedValue("dero1qwasm..."),
    };

    const connector = await createWalletConnector({
      wasm: { bridge: wasmBridge },
    });

    expect(connector.type).toBe("xswd");
  });

  it("blocks WASM when policy does not explicitly allow it", async () => {
    const wasmBridge: WasmWebwalletBridge = {
      getAddress: vi.fn().mockResolvedValue("dero1qwasm..."),
    };

    await expect(
      createWalletConnector({
        preferred: ["wasm-webwallet"],
        wasm: { bridge: wasmBridge },
      })
    ).rejects.toMatchObject({
      code: "SECURITY_POLICY_BLOCKED",
    });
  });

  it("allows explicit WASM selection behind the policy gate", async () => {
    const wasmBridge: WasmWebwalletBridge = {
      getAddress: vi.fn().mockResolvedValue("dero1qwasm..."),
    };

    const connector = await createWalletConnector({
      preferred: ["wasm-webwallet"],
      policy: { allowWasmConnector: true },
      wasm: { bridge: wasmBridge },
    });

    expect(connector).toBeInstanceOf(WasmWebwalletConnector);
    expect(connector.type).toBe("wasm-webwallet");
    expect(connector.supports("transfer")).toBe(false);
  });

  it("fails fast when WASM bridge ABI is malformed", async () => {
    const wasmBridge = {
      getAddress: "not-a-function",
    } as unknown as WasmWebwalletBridge;

    await expect(
      createWalletConnector({
        preferred: ["wasm-webwallet"],
        policy: { allowWasmConnector: true },
        wasm: { bridge: wasmBridge },
      })
    ).rejects.toMatchObject({
      code: "TRANSPORT_FAILURE",
    });
  });
});

describe("WASM bridge probing", () => {
  it("normalizes object bridge aliases (GetAddress -> getAddress)", () => {
    const probe = probeWasmWebwalletBridge({
      GetAddress: () => "dero1qwasm...",
    } as unknown as WasmWebwalletBridge);

    expect(probe).not.toBeNull();
    expect(probe?.source).toBe("explicit");
    expect(typeof probe?.bridge.getAddress).toBe("function");
  });

  it("normalizes flat DERO_JS_* global symbols", () => {
    vi.stubGlobal("DERO_JS_GetAddress", () => "dero1qwasm...");
    const probe = probeWasmWebwalletBridge();
    expect(probe).not.toBeNull();
    expect(probe?.source).toBe("DERO_JS_GLOBALS");
    expect(typeof probe?.bridge.getAddress).toBe("function");
    vi.unstubAllGlobals();
  });

  it("throws on non-callable method in object candidate", () => {
    expect(() =>
      probeWasmWebwalletBridge({
        getAddress: "invalid",
      } as unknown as WasmWebwalletBridge)
    ).toThrow(WalletConnectorError);
  });
});

describe("wallet connector policy", () => {
  it("blocks spend operations when allowSpendOperations is false", () => {
    expect(() =>
      assertSpendOperationsAllowed(
        {
          ...defaultWalletConnectorPolicy,
          allowSpendOperations: false,
        },
        "transfer",
        "xswd"
      )
    ).toThrow(WalletConnectorError);
  });

  it("requires confirmSpendOperation callback when nativeWalletConfirmation is false", async () => {
    const { confirmSpendOperation } = await import(
      "../src/client/connectors/policy.js"
    );

    // No callback and no native confirmation = error
    await expect(
      confirmSpendOperation(
        {
          appName: "Test",
          policy: { ...defaultWalletConnectorPolicy, requireExplicitUserConfirm: true },
          nativeWalletConfirmation: false,
          // No confirmSpendOperation callback provided
        },
        { operation: "transfer", connectorType: "wasm-webwallet" }
      )
    ).rejects.toMatchObject({
      code: "SECURITY_POLICY_BLOCKED",
    });
  });

  it("allows spend when confirmSpendOperation callback returns true", async () => {
    const { confirmSpendOperation } = await import(
      "../src/client/connectors/policy.js"
    );

    await expect(
      confirmSpendOperation(
        {
          appName: "Test",
          policy: { ...defaultWalletConnectorPolicy, requireExplicitUserConfirm: true },
          nativeWalletConfirmation: false,
          confirmSpendOperation: () => true,
        },
        { operation: "transfer", connectorType: "wasm-webwallet" }
      )
    ).resolves.toBeUndefined();
  });

  it("blocks spend when confirmSpendOperation callback returns false", async () => {
    const { confirmSpendOperation } = await import(
      "../src/client/connectors/policy.js"
    );

    await expect(
      confirmSpendOperation(
        {
          appName: "Test",
          policy: { ...defaultWalletConnectorPolicy, requireExplicitUserConfirm: true },
          nativeWalletConfirmation: false,
          confirmSpendOperation: () => false,
        },
        { operation: "transfer", connectorType: "wasm-webwallet" }
      )
    ).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
  });
});

describe("wallet connector error normalization", () => {
  it("maps XSWD permission errors (-32043, -32044) to PERMISSION_DENIED", () => {
    expect(mapRawWalletErrorCode({ code: -32043 }, "permission denied")).toBe(
      "PERMISSION_DENIED"
    );
    expect(mapRawWalletErrorCode({ code: -32044 }, "always deny")).toBe(
      "PERMISSION_DENIED"
    );
    // Also works with string codes
    expect(mapRawWalletErrorCode({ code: "-32043" }, "")).toBe("PERMISSION_DENIED");
    expect(mapRawWalletErrorCode({ code: "-32044" }, "")).toBe("PERMISSION_DENIED");
  });

  it("maps XSWD rate-limit error (-32070) to TRANSPORT_FAILURE", () => {
    // Rate limit closes the socket, so it's a transport failure
    expect(mapRawWalletErrorCode({ code: -32070 }, "rate limit")).toBe(
      "TRANSPORT_FAILURE"
    );
    expect(mapRawWalletErrorCode({ code: "-32070" }, "")).toBe("TRANSPORT_FAILURE");
  });

  it("maps message-based errors when no code is present", () => {
    expect(mapRawWalletErrorCode({}, "not connected to wallet")).toBe(
      "WALLET_NOT_CONNECTED"
    );
    expect(mapRawWalletErrorCode({}, "insufficient funds")).toBe(
      "INSUFFICIENT_FUNDS"
    );
    expect(mapRawWalletErrorCode({}, "connection timeout")).toBe("OFFLINE_MODE");
    expect(mapRawWalletErrorCode({}, "websocket closed")).toBe("TRANSPORT_FAILURE");
  });

  it("normalizes raw transport errors without exposing unstable contracts", () => {
    const error = normalizeWalletConnectorError({
      code: -32043,
      message: "permission denied",
    });

    expect(error).toBeInstanceOf(WalletConnectorError);
    expect(error.code).toBe("PERMISSION_DENIED");
    expect(error.meta).toMatchObject({ rawCode: -32043 });
  });

  it("normalizes rate-limit error to include raw code in meta", () => {
    const error = normalizeWalletConnectorError({
      code: -32070,
      message: "rate limit exceeded",
    });

    expect(error).toBeInstanceOf(WalletConnectorError);
    expect(error.code).toBe("TRANSPORT_FAILURE");
    expect(error.message).toBe("rate limit exceeded");
    expect(error.meta).toMatchObject({ rawCode: -32070 });
  });
});

describe("invoice and x402 transfer compatibility", () => {
  it("preserves integrated-address payments and bigint amounts for XSWD transfer", () => {
    const params = mapTransferRequest(
      [
        {
          destination: "deti1q-integrated-address",
          amountAtomic: 9_007_199_254_740_993n,
        },
      ],
      16
    );

    expect(params.transfers[0]?.destination).toBe("deti1q-integrated-address");
    expect(params.transfers[0]?.amount).toBe("9007199254740993");
    expect(params.ringsize).toBe(16);
  });
});

describe("XSWD connector options", () => {
  it("accepts throttle and reconnect options in constructor", async () => {
    const { XSWDConnector } = await import(
      "../src/client/connectors/xswd/XSWDConnector.js"
    );

    const connector = new XSWDConnector({
      throttleMs: 200,
      autoReconnect: true,
      reconnectDelayMs: 500,
      maxReconnectDelayMs: 10000,
    });

    expect(connector.type).toBe("xswd");
    expect(connector.supports("transfer")).toBe(true);
  });

  it("reports all wallet capabilities including integrated address and signing", async () => {
    const { XSWDConnector } = await import(
      "../src/client/connectors/xswd/XSWDConnector.js"
    );

    const connector = new XSWDConnector();
    const state = connector.getState();

    expect(state.capabilities).toContain("makeIntegratedAddress");
    expect(state.capabilities).toContain("splitIntegratedAddress");
    expect(state.capabilities).toContain("getTransfers");
    expect(state.capabilities).toContain("signData");
    expect(state.capabilities).toContain("checkSignature");
    expect(state.capabilities).toContain("queryKey");
  });
});

describe("multi-transfer confirmation", () => {
  it("includes all transfers in SpendConfirmationRequest", async () => {
    const { confirmSpendOperation } = await import(
      "../src/client/connectors/policy.js"
    );

    const confirmCalls: unknown[] = [];
    const mockConfirm = (request: unknown) => {
      confirmCalls.push(request);
      return true;
    };

    await confirmSpendOperation(
      {
        appName: "Test",
        policy: { ...defaultWalletConnectorPolicy, requireExplicitUserConfirm: true },
        nativeWalletConfirmation: false,
        confirmSpendOperation: mockConfirm,
      },
      {
        operation: "transfer",
        connectorType: "xswd",
        transfers: [
          { destination: "dero1q-addr1", amountAtomic: 1000n },
          { destination: "dero1q-addr2", amountAtomic: 2000n },
          { destination: "dero1q-addr3", amountAtomic: 3000n },
        ],
        // Backward-compatible single fields
        destination: "dero1q-addr1",
        amountAtomic: 1000n,
      }
    );

    expect(confirmCalls).toHaveLength(1);
    const request = confirmCalls[0] as {
      transfers?: Array<{ destination: string; amountAtomic: bigint }>;
    };
    expect(request.transfers).toHaveLength(3);
    expect(request.transfers?.[0]?.destination).toBe("dero1q-addr1");
    expect(request.transfers?.[1]?.amountAtomic).toBe(2000n);
    expect(request.transfers?.[2]?.destination).toBe("dero1q-addr3");
  });
});
