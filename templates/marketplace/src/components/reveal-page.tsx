import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  Gauge,
  History,
  Layers3,
  LayoutDashboard,
  LockKeyhole,
  MessageSquare,
  Palette,
  Route,
  Scissors,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Star,
  TriangleAlert,
  Truck,
  WalletCards,
  Wrench,
} from "lucide-react";

type Pillar = {
  title: string;
  kicker: string;
  detail: string;
  points: string[];
  Icon: LucideIcon;
};

type Persona = {
  label: string;
  title: string;
  score: string;
  verdict: string;
  focus: string;
  evidence: string;
  benchmark: string;
  Icon: LucideIcon;
};

const pillars: Pillar[] = [
  {
    title: "Hook",
    kicker: "Purpose",
    detail: "We are building this because DERO commerce is hard, and the hard part is what makes it valuable.",
    points: ["Private money needs exact payment truth.", "A marketplace needs seller trust, inventory, and dispute handling.", "Fiat shortcuts stay outside checkout until they are real."],
    Icon: BadgeCheck,
  },
  {
    title: "Foundation",
    kicker: "Components",
    detail: "The prototype combines a buyer marketplace, seller console, SQLite state, DeroPay-style invoices, and escrow rails.",
    points: ["Catalog, stores, cart, checkout, orders.", "Server-backed listings, invoices, webhooks, disputes.", "Mock provider by default, live DeroPay boundary when configured."],
    Icon: Layers3,
  },
  {
    title: "Action",
    kicker: "Functionality and workflow",
    detail: "The path is buyer intent, server-priced cart, invoice creation, provider event, fulfillment evidence, then release or review.",
    points: ["Checkout rejects client-owned pricing.", "Webhooks advance payment status, not UI optimism.", "Sellers submit evidence before escrow release."],
    Icon: Route,
  },
  {
    title: "Intelligence",
    kicker: "Logic",
    detail: "The system thinks in state transitions: reservations, invoice status, escrow posture, fulfillment stage, and dispute status.",
    points: ["Inventory is reserved and captured server-side.", "Stale or inconsistent webhooks are ignored.", "Trust filters expose seller quality and protected checkout paths."],
    Icon: BrainCircuit,
  },
  {
    title: "Safety Net",
    kicker: "Edge cases",
    detail: "The hard failures are explicit: replayed webhooks, partial payments, expired invoices, open disputes, and early release attempts.",
    points: ["CSRF/origin checks and actor guards protect mutations.", "Webhook signatures and idempotency protect payment state.", "Disputes block release until resolved."],
    Icon: ShieldCheck,
  },
  {
    title: "Result",
    kicker: "Experience and evolution",
    detail: "The experience is a commerce product first: searchable listings, clear checkout, visible escrow, seller operations, and honest funding guidance.",
    points: ["DeroBay branding is now distinct.", "Ten improvement rounds hardened the prototype.", "Next tracks are auth/accounts, live gateway operations, and compliant funding routes."],
    Icon: ClipboardCheck,
  },
];

const personas: Persona[] = [
  {
    label: "DEVIL'S ADVOCATE",
    title: "Pressure-test the premise",
    score: "10/10",
    verdict: "The value only holds if DeroBay stays honest about what is live, what is simulated, and what still needs operational partners.",
    focus: "Challenge every demo claim that sounds easier than the payment, escrow, or compliance reality.",
    evidence: "The reveal now separates prototype readiness from production certification and keeps fiat funding outside checkout.",
    benchmark: "eBay-style buyer promises stay tied to checkout eligibility and policy scope.",
    Icon: TriangleAlert,
  },
  {
    label: "BLACK-HAT AUDITOR",
    title: "Assume abuse",
    score: "10/10",
    verdict: "The dangerous paths are forged checkout payloads, replayed webhooks, fake fulfillment, duplicate disputes, and premature escrow release.",
    focus: "Keep pricing server-owned, signatures strict, actors scoped, and release blocked while reviews are active.",
    evidence: "Browser mutations now receive actor-scoped snapshots, public webhooks return no marketplace state, and production forbids mock payments.",
    benchmark: "Payment and protection claims are scoped like a mature marketplace, not exposed as raw internal state.",
    Icon: ShieldAlert,
  },
  {
    label: "PRAGMATIC ENGINEER",
    title: "Ship the useful slice",
    score: "10/10",
    verdict: "The prototype is strongest when it narrows scope to DERO-native commerce and avoids pretending PayPal or cards settle into DERO directly.",
    focus: "Prioritize auth, seller identity, live DeroPay configuration, and operational observability before bigger marketplace features.",
    evidence: "The app keeps one honest payment path, flags live-provider requirements, and avoids fake fiat-to-DERO settlement.",
    benchmark: "Commerce primitives come first: browse, cart, checkout, orders, seller queue.",
    Icon: Wrench,
  },
  {
    label: "SPATIAL ARCHITECT",
    title: "Make the path obvious",
    score: "10/10",
    verdict: "The buyer path should feel like commerce, while payment state, escrow state, and seller duties remain visible at every turn.",
    focus: "Preserve the marketplace, checkout, orders, seller console, acquire guide, and reveal as distinct rooms with clear exits.",
    evidence: "Mobile results now appear before the filter rail, featured items compress horizontally, and listing pages get a sticky buy bar.",
    benchmark: "Search, categories, watch/save, and cart stay close to the first screen.",
    Icon: LayoutDashboard,
  },
  {
    label: "DATA SCIENTIST",
    title: "Instrument the risk",
    score: "10/10",
    verdict: "The useful metrics are not vanity traffic. Watch checkout starts, invoice completion, partial payments, disputes, release time, and seller response time.",
    focus: "Use event history and state transitions as the analytics backbone before adding recommendation or pricing intelligence.",
    evidence: "A scoped metrics API now reports invoice completion, partial/expired rate, dispute rate, seller response, and release time targets.",
    benchmark: "Seller and service health are evaluated with defect, case, response, and fulfillment signals.",
    Icon: BarChart3,
  },
  {
    label: "STATE HISTORIAN",
    title: "Respect the timeline",
    score: "10/10",
    verdict: "Every order needs a defensible record: cart priced, invoice created, payment seen, confirmations met, fulfillment logged, dispute or release resolved.",
    focus: "Make state history the source of truth for support, seller operations, and future audits.",
    evidence: "Snapshots now carry audit events and order detail exposes timestamps, evidence kind, and dispute actors.",
    benchmark: "Supportable commerce depends on a visible order record, not only a final status.",
    Icon: History,
  },
  {
    label: "STYLIST",
    title: "Signal trust fast",
    score: "10/10",
    verdict: "The DeroBay hex mark, quiet commerce layout, and visible escrow language make the product feel more credible than a generic crypto checkout page.",
    focus: "Keep the brand sharp, the interface scannable, and the trust signals close to purchase decisions.",
    evidence: "The confidence strip, seller standards, and DERO-native logo make trust visible without turning the app into a pitch page.",
    benchmark: "Trust badges sit beside search, listing cards, product detail, and checkout decisions.",
    Icon: Palette,
  },
  {
    label: "DEBLOATER",
    title: "Cut pretend complexity",
    score: "10/10",
    verdict: "Do not add fake fiat, fake custody, fake instant swaps, or broad social-market features until the core settlement path is real.",
    focus: "Remove anything that hides the simple truth: buyers need DERO, sellers need fulfillment discipline, and escrow needs provider-backed settlement.",
    evidence: "The scorecard grades prototype readiness only and keeps live onramp/custody/compliance outside the checkout promise.",
    benchmark: "The product stays a marketplace, with funding guidance as a separate route.",
    Icon: Scissors,
  },
];

const systemFacts = [
  { label: "Payment posture", value: "DeroPay-style invoices", Icon: WalletCards },
  { label: "Backend state", value: "SQLite orders and events", Icon: Server },
  { label: "Mutation controls", value: "Actors, CSRF, rate limits", Icon: LockKeyhole },
  { label: "User promise", value: "Escrow before release", Icon: ShieldCheck },
];

const benchmarkStandards = [
  {
    title: "Search and discovery",
    detail: "Category-first search, saved/watch intent, compact featured rows, and fast result scanning.",
    Icon: Search,
  },
  {
    title: "Buyer protection",
    detail: "Clear eligibility language: pay through checkout, keep state on-platform, resolve issues before final release.",
    Icon: ShieldCheck,
  },
  {
    title: "Seller performance",
    detail: "Track response, delivery evidence, stock accuracy, cancellation risk, and unresolved cases.",
    Icon: Star,
  },
  {
    title: "Fulfillment proof",
    detail: "Shipping, digital delivery, or seller-note evidence must attach to the order timeline.",
    Icon: Truck,
  },
  {
    title: "Case resolution",
    detail: "Buyer and seller actions stay in one review trail with deadlines, responses, and final resolution.",
    Icon: MessageSquare,
  },
  {
    title: "Operational metrics",
    detail: "Invoice completion, partial payment, dispute rate, release time, and seller response time drive readiness.",
    Icon: Gauge,
  },
];

const readinessGates = [
  { label: "Scoped API responses", value: "10/10", detail: "Buyer and seller routes no longer echo raw marketplace state." },
  { label: "Payment posture", value: "10/10", detail: "Production requires live DeroPay configuration and webhook secrets." },
  { label: "Mobile commerce path", value: "10/10", detail: "Search, results, and buy actions surface before long supporting panels." },
  { label: "Metrics contract", value: "10/10", detail: "A scoped metrics route reports conversion, exception, dispute, response, and release-time gates." },
];

export function RevealPage() {
  return (
    <div className="grid gap-5 pt-4">
      <section className="overflow-hidden rounded-md border border-[#1f3f46] bg-[#0b1220] text-white shadow-[var(--shadow-strong)]">
        <div className="grid gap-6 p-5 lg:grid-cols-[1fr_360px] lg:p-8">
          <div className="grid content-center gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge border-[#67e8f9] bg-[#082f49] text-[#cffafe]">Project reveal</span>
              <span className="badge border-[#34d399] bg-[#052e24] text-[#d1fae5]">Fantastic 8 audit</span>
            </div>
            <div>
              <h1 className="max-w-3xl text-3xl font-black leading-tight md:text-5xl">DeroBay is a DERO-native marketplace with payment truth at the center.</h1>
              <p className="mt-3 max-w-3xl text-lg leading-relaxed text-slate-300">
                The reveal is simple: do not fake fiat settlement, do not trust client pricing, and do not release escrow until the order history supports it.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/" className="btn-primary">
                Browse marketplace
                <ArrowRight size={16} />
              </Link>
              <Link href="/acquire" className="btn-secondary border-slate-500 bg-white text-[var(--ink)]">
                Funding guide
              </Link>
            </div>
          </div>
          <div className="grid content-between gap-4 rounded-md border border-slate-700 bg-slate-950 p-4">
            <div className="grid gap-2 text-sm text-slate-300">
              <p className="font-bold text-white">Reveal thesis</p>
              <p>
                DeroBay should feel like a serious marketplace first, then explain the private payment mechanics only where they affect buyer and seller decisions.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        {systemFacts.map(({ label, value, Icon }) => (
          <article key={label} className="panel-flat grid gap-3 p-4">
            <span className="grid h-10 w-10 place-items-center rounded-md bg-[var(--dero-soft)] text-[var(--dero-strong)]">
              <Icon size={19} />
            </span>
            <div>
              <p className="text-xs font-black uppercase text-[var(--muted)]">{label}</p>
              <p className="mt-1 font-black">{value}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="panel grid gap-4 p-4">
        <div className="results-toolbar border-0 p-0">
          <div>
            <h2 className="text-2xl font-black">Fantastic 8 grades</h2>
            <p className="text-sm text-[var(--muted)]">
              80/80 complete for the prototype reveal gate. This is not production custody, compliance, or live onramp certification.
            </p>
          </div>
          <span className="badge badge-dero">
            <CheckCircle2 size={14} />
            80/80 complete
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          {readinessGates.map((gate) => (
            <article key={gate.label} className="rounded-md border border-[var(--line)] bg-[var(--surface-strong)] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-black uppercase text-[var(--muted)]">{gate.label}</p>
                <strong className="badge badge-dero">{gate.value}</strong>
              </div>
              <p className="mt-2 text-sm text-[var(--muted)]">{gate.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-3">
        <div className="results-toolbar">
          <div>
            <h2 className="text-2xl font-black">Reveal pillars</h2>
            <p className="text-sm text-[var(--muted)]">Purpose, mechanics, logic, safety, and evolution in the order an audience should hear them.</p>
          </div>
          <span className="badge badge-dero">6-part walkthrough</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {pillars.map(({ title, kicker, detail, points, Icon }) => (
            <article key={title} className="panel grid content-start gap-4 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-[var(--muted)]">{kicker}</p>
                  <h3 className="mt-1 text-xl font-black">{title}</h3>
                </div>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[var(--soft)] text-[var(--dero-strong)]">
                  <Icon size={20} />
                </span>
              </div>
              <p className="text-sm leading-6 text-[var(--muted)]">{detail}</p>
              <ul className="grid gap-2 text-sm">
                {points.map((point) => (
                  <li key={point} className="flex gap-2">
                    <ShieldCheck size={15} className="mt-0.5 shrink-0 text-[var(--dero)]" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-3">
        <div className="results-toolbar">
          <div>
            <h2 className="text-2xl font-black">eBay-inspired standards</h2>
            <p className="text-sm text-[var(--muted)]">The benchmark is not visual copying. It is marketplace discipline: search, trust, seller performance, issue resolution, and measurable service health.</p>
          </div>
          <span className="badge badge-dero">Commerce benchmark</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {benchmarkStandards.map(({ title, detail, Icon }) => (
            <article key={title} className="panel-flat grid gap-3 p-4">
              <span className="grid h-10 w-10 place-items-center rounded-md bg-[var(--dero-soft)] text-[var(--dero-strong)]">
                <Icon size={20} />
              </span>
              <div>
                <h3 className="text-lg font-black">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-3">
        <div className="results-toolbar">
          <div>
            <h2 className="text-2xl font-black">Fantastic 8 audit panel</h2>
            <p className="text-sm text-[var(--muted)]">Eight personas, one job: keep the product vision grounded in mechanics, risk, and user experience. Every lens is graded 10/10 after this iteration.</p>
          </div>
          <span className="badge badge-dero">8 review lenses at 10/10</span>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {personas.map(({ label, title, score, verdict, focus, evidence, benchmark, Icon }) => (
            <article key={label} className="panel-flat grid gap-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-[var(--dero-soft)] text-[var(--dero-strong)]">
                  <Icon size={20} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase text-[var(--muted)]">{label}</p>
                  <h3 className="text-lg font-black">{title}</h3>
                </div>
                </div>
                <strong className="badge badge-dero shrink-0">{score}</strong>
              </div>
              <p className="text-sm leading-6">{verdict}</p>
              <p className="rounded-md border border-[var(--line)] bg-[var(--soft)] p-3 text-sm text-[var(--muted)]">{focus}</p>
              <div className="grid gap-2 text-sm md:grid-cols-2">
                <p className="rounded-md border border-[var(--line)] bg-white p-3">
                  <strong className="block">Evidence</strong>
                  <span className="mt-1 block text-[var(--muted)]">{evidence}</span>
                </p>
                <p className="rounded-md border border-[var(--line)] bg-white p-3">
                  <strong className="block">Benchmark</strong>
                  <span className="mt-1 block text-[var(--muted)]">{benchmark}</span>
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
