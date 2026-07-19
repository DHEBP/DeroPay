#!/usr/bin/env node
/**
 * Authoritative published-exports guard.
 *
 * The in-workspace vitest export test resolves `dero-pay/*` through the
 * `node_modules/dero-pay -> ../packages/dero-pay` symlink — i.e. against the LOCAL
 * package.json, which always has every export. That made it blind to what is
 * actually published: `dero-pay@0.4.0` shipped WITHOUT `./x402` and `./agent`, yet
 * CI stayed green while a real `npm install` consumer hit
 * ERR_PACKAGE_PATH_NOT_EXPORTED.
 *
 * This guard instead does what a consumer does: build → `npm pack` → install the
 * resulting .tgz into a throwaway dir OUTSIDE the workspace (no symlink) → import
 * every flagship subpath from the installed package. If the packed tarball is
 * missing an export, the import throws and this script exits non-zero — it goes
 * RED by construction when an export is dropped.
 */
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const pkgDir = process.cwd(); // packages/dero-pay
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: ["ignore", "pipe", "inherit"] }).toString();
const runShow = (cmd, cwd) => execSync(cmd, { cwd, stdio: "inherit" });

console.log("[pack-exports] building…");
run("npm run build", pkgDir);

console.log("[pack-exports] packing…");
const tgz = JSON.parse(run("npm pack --json", pkgDir))[0].filename;
const tgzPath = join(pkgDir, tgz);

const consumer = mkdtempSync(join(tmpdir(), "deropay-consumer-"));
try {
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({ name: "consumer", version: "0.0.0", private: true, type: "module" })
  );
  console.log(`[pack-exports] installing ${tgz} into a clean out-of-workspace dir…`);
  run(`npm install --no-audit --no-fund "${tgzPath}"`, consumer);

  // Resolve EVERY declared subpath through the installed package's exports map.
  // A missing export (exactly what dero-pay@0.4.0 shipped for ./x402 + ./agent)
  // throws ERR_PACKAGE_PATH_NOT_EXPORTED here. import.meta.resolve checks the map
  // without executing the module, so it is immune to a bare consumer lacking
  // peer deps (better-sqlite3/react/next) — build/runtime integrity is covered by
  // the in-workspace vitest suite; THIS guard is about published-export coverage.
  const check = `
    const subpaths = [
      "dero-pay", "dero-pay/rpc", "dero-pay/server", "dero-pay/bridge",
      "dero-pay/escrow", "dero-pay/router", "dero-pay/client", "dero-pay/gateway",
      "dero-pay/react", "dero-pay/next", "dero-pay/x402", "dero-pay/x402/types",
      "dero-pay/x402/server", "dero-pay/x402/client", "dero-pay/x402/next", "dero-pay/agent",
    ];
    import { createRequire } from "node:module";
    const require = createRequire(import.meta.url + "/");
    const bad = [];
    for (const s of subpaths) {
      // ESM condition (import) …
      try { await import.meta.resolve(s); }
      catch (e) { bad.push(s + " [import] -> " + (e && e.code || e)); }
      // … and CJS condition (require) — the exact failure mode that made the
      // Medusa plugin dead-on-install when the SDK had no require condition.
      try { require.resolve(s); }
      catch (e) { bad.push(s + " [require] -> " + (e && e.code || e)); }
    }
    if (bad.length) { console.error("[pack-exports] UNRESOLVABLE exports:\\n  " + bad.join("\\n  ")); process.exit(1); }
    // Negative control: a bogus subpath MUST fail on BOTH conditions. If it
    // resolves, the guard mechanism itself is broken and would go green even with
    // real exports missing.
    let bogus = false;
    try { await import.meta.resolve("dero-pay/__nope__"); bogus = true; } catch {}
    try { require.resolve("dero-pay/__nope__"); bogus = true; } catch {}
    if (bogus) { console.error("[pack-exports] GUARD BROKEN: a bogus subpath resolved"); process.exit(1); }
    console.log("[pack-exports] OK — all " + subpaths.length + " subpaths resolve via BOTH import and require; bogus rejected");
  `;
  writeFileSync(join(consumer, "check.mjs"), check);
  runShow("node check.mjs", consumer);
} finally {
  rmSync(consumer, { recursive: true, force: true });
  rmSync(tgzPath, { force: true });
}
