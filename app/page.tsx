import Link from "next/link";
import { HeroInput } from "@/components/HeroInput";
import { HeroBackdrop } from "@/components/HeroBackdrop";
import { Wordmark } from "@/components/Wordmark";

export default function Landing() {
  return (
    <div className="relative">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-line/60 bg-base-950/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Wordmark className="h-6" />
          <nav className="hidden items-center gap-7 text-sm text-ink-soft md:flex">
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#features" className="hover:text-ink">Features</a>
            <a href="#security" className="hover:text-ink">Responsible use</a>
            <a href="#pricing" className="hover:text-ink">Pricing</a>
          </nav>
          <Link href="/scan?target=northstar&mode=demo" className="mono rounded-lg border border-line px-3 py-1.5 text-xs text-ink hover:bg-base-700">
            Watch demo
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0"><HeroBackdrop /></div>
        <div className="grid-backdrop pointer-events-none absolute inset-0" />
        <div className="relative mx-auto flex max-w-6xl flex-col items-start px-6 pb-28 pt-24 md:pt-32">
          <span className="mono mb-6 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-[11px] uppercase tracking-widest text-signal">
            <span className="h-1.5 w-1.5 rounded-full bg-signal" /> External exposure intelligence
          </span>
          <h1 className="max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight text-ink md:text-6xl">
            See your company <span className="text-gradient">from the outside.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
            You know your company from the inside. OUTSIDE maps your publicly observable digital footprint and
            reveals the forgotten, unexpected, and changing external assets everyone else can see.
          </p>
          <div className="mt-9"><HeroInput /></div>
        </div>
      </section>

      {/* Problem / concept */}
      <section className="border-t border-line/60 bg-base-900/40">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-10 md:grid-cols-3">
            <Concept n="01" title="Your surface is bigger than you think" body="Every certificate, DNS record, and subdomain is public. Staging environments, old portals, and new APIs appear on the internet whether or not anyone is tracking them." />
            <Concept n="02" title="Attackers start with your domain" body="An outsider needs nothing but your domain to begin mapping infrastructure. OUTSIDE shows you exactly what that reconnaissance reveals — from the defender's side." />
            <Concept n="03" title="Facts, not fear" body="Every result separates observed fact from inference from possible risk, with confidence scores and evidence. No fabricated vulnerabilities, no sensationalism." />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl px-6 py-20">
        <SectionTitle kicker="How it works" title="Enter a domain. Watch the footprint reveal itself." />
        <div className="mt-12 grid gap-4 md:grid-cols-4">
          {[
            { s: "Discover", d: "Passive sources — certificate transparency, DNS, public web signals — surface hostnames and services." },
            { s: "Correlate", d: "Assets are normalized and entity-resolved into a single graph with relationship confidence." },
            { s: "Classify", d: "Weak signals combine into shadow-asset, non-production, and authentication classifications." },
            { s: "Explain", d: "A transparent exposure score and evidence-backed findings tell you what to review and why." },
          ].map((x, i) => (
            <div key={x.s} className="panel p-5">
              <div className="mono text-signal">{String(i + 1).padStart(2, "0")}</div>
              <div className="mt-3 text-lg text-ink">{x.s}</div>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{x.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-line/60 bg-base-900/40">
        <div className="mx-auto max-w-6xl space-y-4 px-6 py-20">
          <SectionTitle kicker="Signature features" title="Built to be understood in twenty seconds." />
          <div className="mt-8 grid gap-4 md:grid-cols-6">
            <Feature className="md:col-span-4" title="Attacker View" body="A cinematic replay of how public information gradually reveals your infrastructure — starting from a single domain. Ideal for demos and board conversations. Depicts discovery, never exploitation." tone="signal" />
            <Feature className="md:col-span-2" title="Shadow asset detection" body="Correlated signals — legacy naming, graph isolation, dated technology, absence from your primary site — flag possibly forgotten assets, with the reasoning shown." />
            <Feature className="md:col-span-2" title="Change detection" body="Repeated scans diff your external surface: new hostnames, returning services, and technology shifts, so nothing appears unnoticed." />
            <Feature className="md:col-span-4" title="Explainable exposure score" body="A deterministic 0–100 posture score. Open “Why is my score 37?” to see every penalty and mitigation. It measures how contained your surface is — not a probability of being hacked." />
          </div>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="mx-auto max-w-6xl px-6 py-20">
        <SectionTitle kicker="Responsible use" title="A security product, built securely." />
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {[
            ["Passive by default", "The external snapshot uses only public, non-invasive data sources. No exploitation, no brute force, no unauthorized access — ever."],
            ["SSRF & egress guarded", "Targets are normalized and validated; private, loopback, link-local, and cloud-metadata ranges are refused at a single chokepoint."],
            ["Ownership verification", "Deeper inspection is gated behind DNS TXT / file-based domain ownership verification. Unverified targets get a clearly-labeled external view."],
            ["Rate limited & auditable", "Scan quotas, concurrency controls, request timeouts, and structured audit logging keep the platform from becoming a mass-scanning tool."],
          ].map(([t, d]) => (
            <div key={t} className="panel p-5">
              <div className="text-ink">{t}</div>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-line/60 bg-base-900/40">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <SectionTitle kicker="Pricing" title="Start free. Monitor when it matters." />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <Plan name="Snapshot" price="Free" cadence="one-off" features={["Single external snapshot", "Interactive asset graph", "Attacker View replay", "Top findings"]} />
            <Plan name="Professional" price="$79" cadence="/mo" highlight features={["Up to 5 monitored domains", "Daily scans & change alerts", "Full findings & evidence", "Exposure score history", "PDF reports"]} />
            <Plan name="Agency" price="$249" cadence="/mo" features={["Up to 30 client domains", "Team roles & workspaces", "Scheduled reporting", "Priority discovery providers", "API access"]} />
          </div>
          <p className="mono mt-6 text-center text-xs text-ink-faint">
            Pricing reflects scanning, provider, and AI-explanation costs per monitored domain and frequency.
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-6 py-24 text-center">
        <h2 className="text-4xl font-semibold tracking-tight text-ink">What can an outsider learn about you?</h2>
        <p className="mx-auto mt-4 max-w-lg text-ink-soft">Enter your domain and watch your public digital footprint appear.</p>
        <div className="mt-8 flex flex-col items-center"><HeroInput /></div>
      </section>

      <footer className="border-t border-line/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-xs text-ink-faint md:flex-row">
          <Wordmark className="h-5" />
          <span className="mono">External exposure intelligence · Passive & responsible by design</span>
          <span className="mono">© {new Date().getFullYear()} OUTSIDE</span>
        </div>
      </footer>
    </div>
  );
}

function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div>
      <div className="mono text-[11px] uppercase tracking-widest text-signal">{kicker}</div>
      <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-ink md:text-4xl">{title}</h2>
    </div>
  );
}

function Concept({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div>
      <div className="mono text-sm text-signal">{n}</div>
      <div className="mt-3 text-xl text-ink">{title}</div>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{body}</p>
    </div>
  );
}

function Feature({ title, body, className = "", tone = "neutral" }: { title: string; body: string; className?: string; tone?: "neutral" | "signal" }) {
  return (
    <div className={`panel relative overflow-hidden p-6 ${className}`}>
      {tone === "signal" && <div className="scan-sweep pointer-events-none absolute inset-0 opacity-40" />}
      <div className="relative">
        <div className="text-lg text-ink">{title}</div>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-soft">{body}</p>
      </div>
    </div>
  );
}

function Plan({ name, price, cadence, features, highlight = false }: { name: string; price: string; cadence: string; features: string[]; highlight?: boolean }) {
  return (
    <div className={`panel p-6 ${highlight ? "ring-1 ring-signal/40" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-ink">{name}</span>
        {highlight && <span className="mono rounded-md border border-signal/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-signal">Popular</span>}
      </div>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-semibold text-ink">{price}</span>
        <span className="mono text-xs text-ink-faint">{cadence}</span>
      </div>
      <ul className="mt-5 space-y-2 text-sm text-ink-soft">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <span className="mt-0.5 text-signal">›</span>
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}
