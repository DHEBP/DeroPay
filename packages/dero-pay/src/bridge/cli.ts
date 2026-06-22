#!/usr/bin/env node
/**
 * deropay-bridge CLI.
 *
 *   deropay-bridge run [--config path]      start the daemon (outbound-only)
 *   deropay-bridge status [--config path]   read the heartbeat; exit 0 healthy / 1 not
 *   deropay-bridge config-check [--config path]   validate config + print warnings
 */

import { loadConfig } from "./config.js";
import { PayoutBridge } from "./payout-bridge.js";
import { readHeartbeat, evaluateHealth } from "./health.js";
import { assertNoInboundListeners } from "./no-listener.js";

function parseArgs(argv: string[]): { cmd: string; configPath?: string } {
  const cmd = argv[2] ?? "help";
  let configPath: string | undefined;
  for (let i = 3; i < argv.length; i++) {
    if (argv[i] === "--config" || argv[i] === "-c") configPath = argv[++i];
  }
  return { cmd, configPath };
}

async function main(): Promise<number> {
  const { cmd, configPath } = parseArgs(process.argv);

  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    process.stdout.write(
      "Usage: deropay-bridge <run|status|config-check> [--config <path>]\n"
    );
    return 0;
  }

  if (cmd === "config-check") {
    const { config, warnings } = loadConfig({ configPath });
    process.stdout.write(`config OK (store: ${config.storePath})\n`);
    for (const w of warnings) process.stdout.write(`  warning: ${w}\n`);
    return 0;
  }

  if (cmd === "status") {
    const { config } = loadConfig({ configPath });
    const hb = readHeartbeat(config.heartbeatPath);
    const result = evaluateHealth(hb, Date.now(), config.heartbeatIntervalMs * 3);
    if (result.healthy) {
      process.stdout.write(
        `healthy (pending=${hb!.pending} delivering=${hb!.delivering} dead=${hb!.deadLetters})\n`
      );
      return 0;
    }
    process.stdout.write(`unhealthy: ${result.reason}\n`);
    return 1;
  }

  if (cmd === "run") {
    // Lock the outbound-only posture before anything else binds.
    assertNoInboundListeners();
    const { config, warnings } = loadConfig({ configPath });
    for (const w of warnings) process.stderr.write(`[deropay-bridge] warning: ${w}\n`);

    const bridge = new PayoutBridge(config);
    bridge.installSignalHandlers();
    await bridge.start();
    process.stdout.write(
      `[deropay-bridge] running; webhook -> ${config.webhookUrl}; heartbeat -> ${config.heartbeatPath}\n`
    );
    // Keep the process alive; signal handlers drive shutdown.
    return new Promise<number>(() => {});
  }

  process.stderr.write(`unknown command: ${cmd}\n`);
  return 2;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`[deropay-bridge] fatal: ${err?.message ?? err}\n`);
    process.exit(1);
  });
