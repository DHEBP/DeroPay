/**
 * Outbound-only posture guard.
 *
 * Wraps the inbound-binding entry points (net.Server.prototype.listen,
 * http/http2.createServer, dgram socket bind) so that ANY attempt to open an
 * inbound listener throws. The bridge installs this at startup; the honest
 * claim it backs is "binds no inbound TCP/UDP listener" for the current
 * dependency graph (a JS spy cannot see a native socket opened below Node, so
 * CI additionally runs an OS-level lsof/ss check — see the README).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import net from "node:net";
import http from "node:http";
import http2 from "node:http2";
import dgram from "node:dgram";

let installed = false;

export type NoListenerGuard = { uninstall(): void };

export function assertNoInboundListeners(): NoListenerGuard {
  if (installed) return { uninstall() {} };
  installed = true;

  const fail = (what: string): never => {
    throw new Error(
      `[deropay-bridge] refusing to bind an inbound listener (${what}); ` +
        `the bridge is outbound-only by design`
    );
  };

  const origListen = net.Server.prototype.listen;
  const origCreateServer = http.createServer;
  const origH2Create = http2.createServer;
  const origH2Secure = http2.createSecureServer;
  const origDgram = dgram.createSocket;

  net.Server.prototype.listen = function (...args: any[]): any {
    return fail("net.Server.listen");
  };
  (http as any).createServer = (...args: any[]): any => fail("http.createServer");
  (http2 as any).createServer = (...args: any[]): any => fail("http2.createServer");
  (http2 as any).createSecureServer = (...args: any[]): any =>
    fail("http2.createSecureServer");
  (dgram as any).createSocket = (...args: any[]): any => {
    // Creating a dgram socket is fine; BINDING it inbound is not. Wrap bind.
    const sock = origDgram.apply(dgram, args as any);
    const origBind = sock.bind.bind(sock);
    (sock as any).bind = (...bindArgs: any[]): any => fail("dgram.bind");
    void origBind;
    return sock;
  };

  return {
    uninstall() {
      net.Server.prototype.listen = origListen;
      (http as any).createServer = origCreateServer;
      (http2 as any).createServer = origH2Create;
      (http2 as any).createSecureServer = origH2Secure;
      (dgram as any).createSocket = origDgram;
      installed = false;
    },
  };
}
