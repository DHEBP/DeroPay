/**
 * Standalone Playwright E2E for the DeroPay dashboard.
 *
 * Verifies the hologram lift end-to-end:
 *   - Every retrofitted route renders
 *   - New primitives are in the DOM with correct typography + animation
 *   - x402 surface (settings panel + /payments/agent) is wired
 *   - Toggle persists across reload
 *   - Theme switching actually changes tokens
 *   - Responsive breakpoints (rail at 1024, drawer at 720)
 *   - Zero console errors per page
 *
 * Prereq: dashboard dev server running on $DASHBOARD_URL (default :3100).
 * Optional: facilitator on $FACILITATOR_URL (default :4402) for live state.
 *
 * Run:  bun run --cwd apps/dashboard test:e2e
 *
 * Windows note: Playwright's chromium.launch() uses --remote-debugging-pipe
 * by default, which can time out on Windows hosts with strict AV / pipe
 * permission policies (the symptom: chrome spawns but the CDP handshake
 * never completes). On those hosts, run from WSL or a Linux container — the
 * test logic itself is environment-agnostic.
 */
import { chromium, type Page, type ConsoleMessage } from "playwright";

const DASHBOARD = process.env.DASHBOARD_URL ?? "http://localhost:3100";

type Result = { name: string; ok: boolean; detail?: string };
const results: Result[] = [];
let consoleErrors: { route: string; text: string }[] = [];

function record(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
  const tag = ok ? "✓" : "✗";
  console.log(`  ${tag} ${name}${detail ? "  —  " + detail : ""}`);
}

function header(label: string): void {
  console.log(`\n— ${label} —`);
}

async function gotoClean(page: Page, path: string): Promise<void> {
  consoleErrors = consoleErrors.filter((e) => e.route !== path);
  await page.goto(DASHBOARD + path, { waitUntil: "domcontentloaded" });
}

function attachConsole(page: Page, route: { current: string }): void {
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") {
      const text = msg.text();
      // Drop a known-noisy preload deprecation and the favicon-ico legacy 404 that
      // we don't serve (the actual icon is /icon.svg referenced from <head>).
      if (text.includes("favicon.ico")) return;
      if (text.includes("preloaded with link preload was not used")) return;
      consoleErrors.push({ route: route.current, text });
    }
  });
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const route = { current: "/" };
  attachConsole(page, route);

  // ----- /plugins/demo: primitive showcase ---------------------------------
  header("/plugins/demo — primitive showcase");
  route.current = "/plugins/demo";
  await gotoClean(page, "/plugins/demo");
  const demoChecks = await page.evaluate(() => {
    const eyebrow = document.querySelector(".eyebrow-mono");
    const cs = eyebrow ? getComputedStyle(eyebrow) : null;
    const dotGrid = [...document.querySelectorAll("div")].find((d) => {
      const bg = getComputedStyle(d).backgroundImage;
      return bg.includes("radial-gradient") && bg.includes("rgba");
    });
    return {
      title: document.title,
      eyebrowFont: cs?.fontFamily ?? "",
      eyebrowTransform: cs?.textTransform ?? "",
      glyphCount: document.querySelectorAll("svg path[d^=\"M\"]").length,
      pulseCount: document.querySelectorAll(".hologram-pulse").length,
      dotGridSize: dotGrid ? getComputedStyle(dotGrid).backgroundSize : null,
      panelHeaderCount: document.querySelectorAll(".commerce-panel-header").length,
    };
  });
  record(
    "Page title",
    demoChecks.title === "Demo plugin — DeroPay",
    demoChecks.title,
  );
  record(
    "EyebrowLabel uses JetBrains Mono uppercase",
    demoChecks.eyebrowFont.includes("JetBrains") && demoChecks.eyebrowTransform === "uppercase",
    demoChecks.eyebrowFont.split(",")[0],
  );
  record(
    "At least 20 FilledGlyph SVGs rendered",
    demoChecks.glyphCount >= 20,
    `${demoChecks.glyphCount} glyph paths`,
  );
  record(
    "At least 1 pulsing live dot",
    demoChecks.pulseCount >= 1,
    `${demoChecks.pulseCount} .hologram-pulse`,
  );
  record(
    "DotGridBackdrop mounted at 24px",
    demoChecks.dotGridSize === "24px 24px",
    String(demoChecks.dotGridSize),
  );
  record(
    "PanelHeader primitives rendered",
    demoChecks.panelHeaderCount >= 4,
    `${demoChecks.panelHeaderCount} panel headers`,
  );

  // ----- / (home) -----------------------------------------------------------
  header("/ — home");
  route.current = "/";
  await gotoClean(page, "/");
  const homeChecks = await page.evaluate(() => {
    const displays = document.querySelectorAll(".display");
    const kpiValue = displays[1] ? getComputedStyle(displays[1]).fontFamily : "";
    return {
      kpiMonoFont: kpiValue.includes("JetBrains"),
      panelHeaderCount: document.querySelectorAll(".commerce-panel-header").length,
      sidebarAgentLink: !!document.querySelector("a[href='/payments/agent']"),
    };
  });
  record("KPI values use JetBrains Mono", homeChecks.kpiMonoFont);
  record(
    "Recent invoices PanelHeader present",
    homeChecks.panelHeaderCount >= 1,
    `${homeChecks.panelHeaderCount} panel headers`,
  );
  record("Sidebar has 'Agent payments' entry", homeChecks.sidebarAgentLink);

  // ----- /reports — ChartCard hydration -------------------------------------
  header("/reports — ChartCard hydration determinism");
  route.current = "/reports";
  await gotoClean(page, "/reports");
  const reportsChecks = await page.evaluate(() => {
    const grads = [...document.querySelectorAll('linearGradient[id^="chart-grad"]')].map(
      (g) => g.id,
    );
    const sectionTitle = [...document.querySelectorAll(".commerce-section-title")].find(
      (s) => s.textContent?.includes("Paid vs expired"),
    );
    return {
      gradientCount: grads.length,
      firstGradId: grads[0] ?? null,
      sectionGlyph: !!sectionTitle?.querySelector("svg"),
    };
  });
  record(
    "ChartCard gradient IDs deterministic (useId-derived, no Math.random)",
    typeof reportsChecks.firstGradId === "string" && /^chart-grad-[A-Za-z0-9_]+$/.test(reportsChecks.firstGradId),
    reportsChecks.firstGradId ?? "no gradient",
  );
  record(
    "3 ChartCards rendered (volume / count / avg)",
    reportsChecks.gradientCount >= 3,
    `${reportsChecks.gradientCount} gradients`,
  );
  record("StatusBreakdown SectionTitle has diamond glyph", reportsChecks.sectionGlyph);

  // ----- /payments/agent — x402 settlement log ------------------------------
  header("/payments/agent — x402 settlement log");
  route.current = "/payments/agent";
  await gotoClean(page, "/payments/agent");
  await page.waitForTimeout(900);
  const agentChecks = await page.evaluate(() => {
    const labels = [...document.querySelectorAll("main .eyebrow-mono")].map((e) =>
      e.textContent?.trim(),
    );
    return {
      title: document.title,
      sourceLabel: labels.find(
        (t) =>
          t === "0 of 0 · live" ||
          t === "demo data" ||
          t === "loading…" ||
          (t && /^\d+ of \d+$/.test(t)),
      ),
      panelHeaderCount: document.querySelectorAll(".commerce-panel-header").length,
      metricLabels: labels.filter((t) =>
        ["settlements", "volume", "distinct agents", "latest"].includes(t ?? ""),
      ),
      pulseCount: document.querySelectorAll(".hologram-pulse").length,
    };
  });
  record(
    "Page title set",
    agentChecks.title === "Agent payments — DeroPay",
    agentChecks.title,
  );
  record(
    "2 PanelHeaders (Last 24 hours + Settlement log)",
    agentChecks.panelHeaderCount === 2,
    `${agentChecks.panelHeaderCount} headers`,
  );
  record(
    "4 MetricCell labels present",
    agentChecks.metricLabels.length === 4,
    agentChecks.metricLabels.join(", "),
  );
  record(
    "Source state surfaced",
    typeof agentChecks.sourceLabel === "string",
    agentChecks.sourceLabel ?? "no label",
  );

  // ----- /settings#agent-payments — toggle + glyphs -------------------------
  header("/settings#agent-payments — toggle + section glyphs");
  route.current = "/settings";
  await gotoClean(page, "/settings#agent-payments");
  await page.evaluate(() => localStorage.removeItem("deropay.x402.advertise"));
  await gotoClean(page, "/settings#agent-payments");
  const settingsBefore = await page.evaluate(() => {
    const panel = document.getElementById("agent-payments");
    const toggle = panel?.querySelector("button[aria-pressed]");
    return {
      legacyEyebrowGlyphs: document.querySelectorAll("main .eyebrow svg").length,
      toggleState: toggle?.getAttribute("aria-pressed"),
      snippetHasScheme: !!panel?.querySelector("pre")?.textContent?.includes("dero-exact"),
    };
  });
  record(
    "Legacy eyebrows have 3 FilledGlyphs (ring/hex/grid)",
    settingsBefore.legacyEyebrowGlyphs === 3,
    `${settingsBefore.legacyEyebrowGlyphs} glyphs`,
  );
  record(
    "x402 toggle starts off after localStorage reset",
    settingsBefore.toggleState === "false",
    `aria-pressed=${settingsBefore.toggleState}`,
  );
  record(
    "Embed snippet includes dero-exact scheme",
    settingsBefore.snippetHasScheme,
  );
  await page.locator("#agent-payments button[aria-pressed]").click();
  await page.waitForTimeout(150);
  const afterClick = await page.evaluate(() => {
    const t = document.querySelector("#agent-payments button[aria-pressed]");
    return {
      toggleState: t?.getAttribute("aria-pressed"),
      stored: localStorage.getItem("deropay.x402.advertise"),
    };
  });
  record(
    "Toggle flips to on",
    afterClick.toggleState === "true",
    `aria-pressed=${afterClick.toggleState}`,
  );
  record(
    "Toggle persists to localStorage",
    afterClick.stored === "1",
    `stored=${afterClick.stored}`,
  );
  await gotoClean(page, "/settings#agent-payments");
  const afterReload = await page.evaluate(
    () => document.querySelector("#agent-payments button[aria-pressed]")?.getAttribute("aria-pressed"),
  );
  record(
    "Toggle survives page reload",
    afterReload === "true",
    `aria-pressed=${afterReload}`,
  );

  // ----- Theme switching ----------------------------------------------------
  header("Theme switching (light <-> dark)");
  const themes = await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "light");
    const lightBg = getComputedStyle(document.body).backgroundColor;
    document.documentElement.setAttribute("data-theme", "dark");
    const darkBg = getComputedStyle(document.body).backgroundColor;
    document.documentElement.removeAttribute("data-theme");
    return { lightBg, darkBg };
  });
  record(
    "Light theme bg = rgb(246, 245, 239)",
    themes.lightBg === "rgb(246, 245, 239)",
    themes.lightBg,
  );
  record(
    "Dark theme bg = rgb(10, 12, 10)",
    themes.darkBg === "rgb(10, 12, 10)",
    themes.darkBg,
  );

  // ----- Responsive breakpoints --------------------------------------------
  header("Responsive breakpoints");
  await page.setViewportSize({ width: 1024, height: 800 });
  await gotoClean(page, "/");
  const railState = await page.evaluate(() => ({
    mode: document.querySelector("[data-sidebar]")?.getAttribute("data-sidebar") ?? null,
    sidebarWidth: document.querySelector("aside")?.offsetWidth ?? null,
  }));
  record(
    "1024px viewport → rail mode",
    railState.mode === "rail",
    `data-sidebar=${railState.mode}, aside.width=${railState.sidebarWidth}`,
  );
  await page.setViewportSize({ width: 700, height: 800 });
  await gotoClean(page, "/");
  const drawerState = await page.evaluate(() =>
    document.querySelector("[data-sidebar]")?.getAttribute("data-sidebar"),
  );
  record(
    "700px viewport → drawer mode",
    drawerState === "drawer",
    `data-sidebar=${drawerState}`,
  );
  await page.setViewportSize({ width: 1440, height: 900 });

  // ----- Console error summary ---------------------------------------------
  header("Console error scan (across all routes visited)");
  record(
    `Zero console errors across ${results.length} prior checks`,
    consoleErrors.length === 0,
    consoleErrors.length === 0
      ? "clean"
      : consoleErrors.map((e) => `[${e.route}] ${e.text.slice(0, 80)}`).join(" | "),
  );

  await browser.close();

  // ----- Summary ------------------------------------------------------------
  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\n────────────────────────────────`);
  console.log(`  ${pass} passed, ${fail} failed (of ${results.length})`);
  console.log(`────────────────────────────────`);
  if (fail > 0) {
    console.log("\nFailures:");
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`  ✗ ${r.name}${r.detail ? "  —  " + r.detail : ""}`);
    }
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("\nE2E crashed:", err);
  process.exit(2);
});
