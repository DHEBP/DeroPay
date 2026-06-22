import { describe, it, expect, afterEach } from "vitest";
import net from "node:net";
import http from "node:http";
import http2 from "node:http2";
import { assertNoInboundListeners } from "../src/bridge/no-listener.js";

/**
 * The security headline (invariant 8 / O7/O22): the bridge binds NO inbound
 * TCP/UDP listener. The guard wraps the inbound entry points so any attempt
 * throws. We assert the guard fires on each surface AND on a planted lazy
 * listen (the negative control — a future dep that tries to bind on first use
 * must still be caught). A JS spy cannot see native sockets, so CI additionally
 * runs an OS-level lsof/ss check (documented in the README).
 */
describe("outbound-only posture guard", () => {
  let uninstall: (() => void) | null = null;

  afterEach(() => {
    uninstall?.();
    uninstall = null;
  });

  it("throws when anything calls net.Server.listen", () => {
    uninstall = assertNoInboundListeners().uninstall;
    const server = net.createServer();
    expect(() => server.listen(0)).toThrow(/outbound-only/);
  });

  it("throws when anything calls http.createServer", () => {
    uninstall = assertNoInboundListeners().uninstall;
    expect(() => http.createServer()).toThrow(/outbound-only/);
  });

  it("throws when anything calls http2.createServer / createSecureServer", () => {
    uninstall = assertNoInboundListeners().uninstall;
    expect(() => http2.createServer()).toThrow(/outbound-only/);
    expect(() => http2.createSecureServer()).toThrow(/outbound-only/);
  });

  it("negative control: a planted lazy listen is still caught after boot", () => {
    uninstall = assertNoInboundListeners().uninstall;
    // Simulate a dependency that defers binding until first use.
    const lazilyBindLater = () => {
      const s = net.createServer();
      s.listen(12345);
    };
    expect(lazilyBindLater).toThrow(/outbound-only/);
  });

  it("uninstall restores normal binding (no leakage across tests)", async () => {
    const guard = assertNoInboundListeners();
    guard.uninstall();
    // After uninstall, a real ephemeral listener works and is cleaned up.
    await new Promise<void>((resolve, reject) => {
      const s = net.createServer();
      s.listen(0, () => {
        s.close(() => resolve());
      });
      s.on("error", reject);
    });
  });
});
