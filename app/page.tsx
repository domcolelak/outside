import Link from "next/link";
import { HeroInput } from "@/components/HeroInput";
import { HeroBackdrop } from "@/components/HeroBackdrop";
import { Wordmark } from "@/components/Wordmark";
import { LandingDemo } from "@/components/experience/LandingDemo";
import { NavAuthLink } from "@/components/NavAuthLink";

export default function Landing() {
  return (
    <div className="relative">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-line/60 bg-base-950/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Wordmark className="h-6" />
          <nav className="hidden items-center gap-7 text-sm text-ink-soft md:flex">
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#features" className="hover:text-ink">Features</a>
            <a href="#intelligence" className="hover:text-ink">Intelligence</a>
            <a href="#guardian" className="hover:text-ink">Guardian</a>
            <a href="#security" className="hover:text-ink">Responsible use</a>
            <a href="#pricing" className="hover:text-ink">Pricing</a>
          </nav>
          <div className="flex items-center gap-2">
            <NavAuthLink />
            <Link href="/scan?target=northstar&mode=demo" className="mono rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink hover:bg-base-700 sm:px-3">
              Watch demo
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative min-h-[760px] overflow-hidden">
        <div className="absolute inset-0 opacity-35"><HeroBackdrop /></div>
        <div className="grid-backdrop pointer-events-none absolute inset-0" />
        <div className="hero-orb pointer-events-none absolute left-[18%] top-20 h-[520px] w-[520px] rounded-full" />
        <div className="relative mx-auto grid max-w-[1380px] gap-16 px-6 pb-24 pt-20 lg:grid-cols-[.9fr_1.1fr] lg:items-center lg:pt-28">
          <div className="min-w-0 animate-rise-in">
            <span className="mono mb-7 inline-flex items-center gap-2 rounded-full border border-signal/20 bg-signal/4 px-3 py-1.5 text-[11px] uppercase tracking-[.2em] text-signal">
              <span className="relative flex h-1.5 w-1.5"><span className="absolute h-full w-full animate-ping rounded-full bg-signal opacity-30"/><span className="relative h-1.5 w-1.5 rounded-full bg-signal"/></span> External exposure intelligence
            </span>
            <h1 className="display-type max-w-3xl text-4xl font-semibold leading-[.98] tracking-[-.045em] text-ink sm:text-5xl md:text-7xl">
              See what the internet knows <span className="text-gradient">about your company.</span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-ink-soft">
              From a single domain: everything the internet exposes about you — mapped, correlated against actively-exploited vulnerabilities, remembered through time, and traced to what depends on what. Evidence for every claim; Guardian watches it after every scan.
            </p>
            <div className="mt-9"><HeroInput /></div>
            <div className="mt-8 grid max-w-xl grid-cols-3 gap-4 border-t border-line pt-5">{[["Passive", "by default"], ["Traceable", "evidence"], ["Continuous", "Guardian"]].map(([value, label]) => <div key={value}><div className="text-sm font-medium text-ink">{value}</div><div className="mono mt-1 text-[10px] uppercase tracking-wider text-ink-faint">{label}</div></div>)}</div>
          </div>
          <div className="min-w-0 animate-rise-in [animation-delay:180ms]"><LandingDemo /></div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-linear-to-t from-base-950 to-transparent"/>
      </section>

      {/* Guardian */}
      <section id="guardian" className="relative overflow-hidden border-t border-line/60">
        <div className="grid-backdrop pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-6 py-28 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
          <div>
            <div className="mono inline-flex items-center gap-2 rounded-full border border-signal/20 bg-signal/5 px-3 py-1.5 text-[11px] uppercase tracking-[.18em] text-signal"><span className="relative flex h-2 w-2"><span className="absolute h-full w-full animate-ping rounded-full bg-signal opacity-30"/><span className="relative h-2 w-2 rounded-full bg-signal"/></span>OUTSIDE Guardian</div>
            <h2 className="mt-6 text-4xl font-semibold tracking-tight text-ink">Analyst-grade context.<br/><span className="text-gradient">After every scheduled scan.</span></h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-ink-soft">Guardian correlates every verified observation into meaningful change intelligence: Exposure Drift, a living security checklist, evidence-backed recommendations, tailored remediation, grouped workflow alerts, and a weekly executive digest.</p>
            <div className="mt-7 flex flex-wrap gap-2">{["Exposure Drift", "Security checklist", "Remediation guides", "Executive digest", "Slack · Teams · Jira"].map((item) => <span key={item} className="mono rounded-full border border-line bg-base-900/70 px-3 py-1.5 text-[11px] text-ink-soft">{item}</span>)}</div>
          </div>
          <div className="premium-surface relative overflow-hidden p-5 md:p-7">
            <div className="mono mb-4 inline-flex rounded-sm border border-accent/20 bg-accent/5 px-2 py-1 text-[10px] uppercase tracking-wider text-accent">Illustrative synthetic scenario</div>
            <div className="absolute right-5 top-5 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-signal shadow-glow"/><span className="mono text-[11px] uppercase text-signal">watching</span></div>
            <div className="mono text-[11px] uppercase tracking-[.18em] text-ink-faint">Exposure Drift · 30 days</div>
            <div className="mt-3 text-2xl font-medium text-ink">External exposure is becoming <span className="text-signal">simpler.</span></div>
            <svg viewBox="0 0 400 120" className="mt-8 w-full" aria-hidden><defs><linearGradient id="landing-guardian" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#38e1c3" stopOpacity=".25"/><stop offset="1" stopColor="#38e1c3" stopOpacity="0"/></linearGradient></defs><path d="M0 90 C55 82, 80 95, 125 72 S210 68, 250 47 S335 55, 400 24 L400 120 L0 120Z" fill="url(#landing-guardian)"/><path d="M0 90 C55 82, 80 95, 125 72 S210 68, 250 47 S335 55, 400 24" fill="none" stroke="#38e1c3" strokeWidth="2"/></svg>
            <div className="mt-4 grid grid-cols-3 gap-2">{[["+3", "new assets"], ["2", "review items"], ["8/10", "controls"]].map(([value, label]) => <div key={label} className="rounded-lg border border-line bg-base-950/70 p-3"><div className="text-lg font-semibold text-ink">{value}</div><div className="mono mt-1 text-[10px] uppercase text-ink-faint">{label}</div></div>)}</div>
            <div className="mt-3 rounded-lg border border-risk-medium/15 bg-risk-medium/5 p-3"><div className="mono text-[10px] uppercase text-risk-medium">Review</div><div className="mt-1 text-xs text-ink-soft">A previously observed staging asset is publicly reachable again.</div></div>
          </div>
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
            { s: "Discover", d: "Passive sources — certificate transparency, DNS, public web signals, and optional commercial passive-DNS — surface hostnames and services." },
            { s: "Correlate", d: "Assets are normalized and entity-resolved into a single graph with relationship confidence." },
            { s: "Classify", d: "Weak signals combine into shadow-asset, non-production, and authentication classifications." },
            { s: "Explain", d: "A transparent protection posture and evidence-backed findings tell you what to review and why." },
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
            <Feature className="md:col-span-4" title="Explainable protection posture" body="A deterministic 0–100 protection posture. Open “Why is my posture 37/100?” to see every penalty and mitigation. It measures how contained your surface is — not a probability of being hacked." />
          </div>
        </div>
      </section>

      {/* Intelligence layers */}
      <section id="intelligence" className="mx-auto max-w-6xl px-6 py-20">
        <SectionTitle kicker="Intelligence layers" title="Not just what's exposed — what it means, and how it moves." />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            { t: "Exploited-vulnerability correlation", d: "Disclosed technology versions are matched against a curated CVE set and enriched with live CISA KEV (exploited in the wild, ransomware links, federal deadlines) and FIRST.org EPSS probability. A version banner is an item to confirm — never a confirmed exploit." },
            { t: "Threat & telemetry enrichment", d: "Bring your keys and OUTSIDE reaches further on verified targets: passive-DNS (SecurityTrails, Shodan) and Censys service discovery expand the surface; AbuseIPDB, GreyNoise, VirusTotal and HaveIBeenPwned add reputation, classification and breach exposure." },
            { t: "Chronos · security time machine", d: "Reconstruct your external surface as it was on any day, diff any two moments, and replay how exposure evolved — grounded only in observations that were actually recorded." },
            { t: "Digital Twin · dependency & blast radius", d: "Read the surface as a dependency graph: what relies on what, and exactly which assets break if a shared CDN, nameserver, address or technology fails or is compromised." },
            { t: "Capability registry · radical transparency", d: "A code-backed inventory of exactly what OUTSIDE detects — passive or active, always-on or operator-keyed — kept honest by a test that fails if the registry ever drifts from what a real scan produces." },
            { t: "Evolution · learns what to build next", d: "OUTSIDE watches which vulnerabilities are being exploited and drafts evidence-backed proposals for coverage it doesn't yet have. It proposes and prepares; you approve. It never changes itself." },
          ].map((x) => (
            <div key={x.t} className="panel p-5">
              <div className="text-ink">{x.t}</div>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{x.d}</p>
            </div>
          ))}
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
            <Plan name="Snapshot" price="Free" cadence="one-off" cta={{ label: "Create free account", href: "/login" }} features={["Single external snapshot", "Interactive asset graph", "Attacker View replay", "Top findings"]} />
            <Plan name="Professional" price="$79" cadence="/mo" highlight cta={{ label: "Start with Professional", href: "/login?next=/billing" }} features={["OUTSIDE Guardian", "Up to 5 monitored domains", "Vulnerability correlation (KEV + EPSS)", "Chronos time machine & Digital Twin", "Living checklist & remediation", "Weekly executive digest"]} />
            <Plan name="Agency" price="$249" cadence="/mo" cta={{ label: "Start with Agency", href: "/login?next=/billing" }} features={["Guardian across 30 client domains", "Team roles & workspaces", "White-label client reporting", "Slack, Teams, Jira & issue workflows", "API access"]} />
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
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <Wordmark className="h-5" />
              <p className="mono mt-3 max-w-xs text-xs leading-5 text-ink-faint">External exposure intelligence. Passive and responsible by design — discovery, never exploitation.</p>
            </div>
            <nav className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-ink-soft">
              <a href="#how" className="hover:text-ink">How it works</a>
              <a href="#features" className="hover:text-ink">Features</a>
              <a href="#pricing" className="hover:text-ink">Pricing</a>
              <a href="#security" className="hover:text-ink">Responsible use</a>
              <Link href="/login" className="hover:text-ink">Sign in</Link>
            </nav>
            <nav className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-ink-soft">
              <Link href="/privacy" className="hover:text-ink">Privacy</Link>
              <Link href="/terms" className="hover:text-ink">Terms</Link>
              <Link href="/security" className="hover:text-ink">Security</Link>
              <a href="mailto:security@outsideguardian.eu" className="hover:text-ink">Report a vulnerability</a>
            </nav>
          </div>
          <div className="mono mt-8 border-t border-line/40 pt-6 text-[12px] leading-5 text-ink-faint">
            © {new Date().getFullYear()} VeDomEll s. r. o. · Alžbetina 55, 040 01 Košice, Slovakia · IČO 52498751
          </div>
        </div>
      </footer>
    </div>
  );
}

function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div>
      <div className="mono text-[12px] uppercase tracking-widest text-signal">{kicker}</div>
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

function Plan({ name, price, cadence, features, cta, highlight = false }: { name: string; price: string; cadence: string; features: string[]; cta: { label: string; href: string }; highlight?: boolean }) {
  return (
    <div className={`panel flex flex-col p-6 ${highlight ? "ring-1 ring-signal/40" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-ink">{name}</span>
        {highlight && <span className="mono rounded-md border border-signal/30 px-2 py-0.5 text-[11px] uppercase tracking-wider text-signal">Popular</span>}
      </div>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-semibold text-ink">{price}</span>
        <span className="mono text-xs text-ink-faint">{cadence}</span>
      </div>
      <ul className="mt-5 flex-1 space-y-2 text-sm text-ink-soft">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <span className="mt-0.5 text-signal">›</span>
            {f}
          </li>
        ))}
      </ul>
      <Link
        href={cta.href}
        className={`mono mt-6 block rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition ${highlight ? "bg-signal text-base-950 shadow-glow hover:bg-signal-bright" : "border border-line text-ink hover:bg-base-700"}`}
      >
        {cta.label}
      </Link>
    </div>
  );
}
