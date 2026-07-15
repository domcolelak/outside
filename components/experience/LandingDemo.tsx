"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const scenes = [
  { label: "Seed", time: "00:00", title: "One domain enters the lens", detail: "northstarlabs.io becomes the deterministic root entity.", metric: "1 asset", evidence: "Scan target · observed" },
  { label: "Discover", time: "00:04", title: "Public infrastructure resolves", detail: "Certificate transparency and DNS agree on six public hostnames.", metric: "7 assets", evidence: "crt.sh + Cloudflare DoH · correlated" },
  { label: "Classify", time: "00:08", title: "An authentication surface emerges", detail: "A public hostname and verified HTTPS response expose a login boundary.", metric: "91% confidence", evidence: "DNS + HTTPS · 2 independent paths" },
  { label: "Change", time: "00:12", title: "A staging asset has returned", detail: "Historical identity links the hostname to an asset absent from the last scan.", metric: "+1 returned", evidence: "Immutable snapshots · exact comparison" },
  { label: "Explain", time: "00:16", title: "Guardian turns evidence into action", detail: "The finding is prioritized with provenance, impact and a review—not a fabricated vulnerability.", metric: "3 review items", evidence: "Deterministic evidence · fully traceable" },
];

const nodes = [
  { x: 50, y: 50, at: 0, label: "northstarlabs.io", tone: "root" },
  { x: 25, y: 28, at: 1, label: "api", tone: "normal" },
  { x: 74, y: 24, at: 1, label: "www", tone: "normal" },
  { x: 17, y: 68, at: 1, label: "mail", tone: "normal" },
  { x: 82, y: 64, at: 2, label: "login", tone: "risk" },
  { x: 55, y: 83, at: 3, label: "stage", tone: "warn" },
  { x: 45, y: 18, at: 1, label: "cdn", tone: "normal" },
];

export function LandingDemo() {
  const [scene, setScene] = useState(0);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setScene((value) => (value + 1) % scenes.length), 4_000);
    return () => window.clearInterval(timer);
  }, [playing]);
  const current = scenes[scene]!;
  return <div className="relative w-full max-w-[620px] overflow-hidden rounded-[22px] border border-line-strong bg-base-950/82 shadow-[0_40px_140px_-50px_rgba(56,225,195,.25)] backdrop-blur-xl">
    <div className="flex items-center justify-between border-b border-line px-4 py-3"><div className="flex items-center gap-2"><span className="relative flex h-2 w-2"><span className="absolute h-full w-full animate-ping rounded-full bg-signal opacity-30"/><span className="relative h-2 w-2 rounded-full bg-signal"/></span><span className="mono text-[9px] uppercase tracking-[.18em] text-signal">Live product story</span></div><div className="mono text-[9px] text-ink-faint">NORTHSTAR LABS · DEMO</div></div>
    <div className="relative aspect-[16/10] min-h-[360px]">
      <div className="grid-backdrop absolute inset-0 opacity-60"/>
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-label="Animated external asset graph">
        <defs><radialGradient id="landing-node"><stop offset="0" stopColor="#38e1c3" stopOpacity=".75"/><stop offset="1" stopColor="#38e1c3" stopOpacity="0"/></radialGradient></defs>
        {nodes.slice(1).map((node, index) => <line key={`edge-${node.label}`} x1="50" y1="50" x2={node.x} y2={node.y} className={`transition-all duration-700 ${scene >= node.at ? "opacity-100" : "opacity-0"}`} stroke={node.tone === "risk" ? "rgba(255,138,91,.42)" : node.tone === "warn" ? "rgba(245,196,81,.4)" : "rgba(148,173,214,.2)"} strokeWidth=".35" style={{ transitionDelay: `${index * 80}ms` }}/>) }
        {nodes.map((node, index) => { const visible = scene >= node.at; const color = node.tone === "root" ? "#e8edf6" : node.tone === "risk" ? "#ff8a5b" : node.tone === "warn" ? "#f5c451" : "#38e1c3"; return <g key={node.label} className={`transition-all duration-700 ${visible ? "opacity-100" : "opacity-0"}`} style={{ transformOrigin: `${node.x}px ${node.y}px`, transform: visible ? "scale(1)" : "scale(.25)", transitionDelay: `${index * 90}ms` }}><circle cx={node.x} cy={node.y} r={node.tone === "root" ? 5 : 3.7} fill={color} opacity=".13"/><circle cx={node.x} cy={node.y} r={node.tone === "root" ? 2 : 1.35} fill={color}/><circle cx={node.x} cy={node.y} r={node.tone === "root" ? 7 : 5.4} fill="none" stroke={color} strokeWidth=".3" opacity={scene === node.at ? ".8" : ".18"}/><text x={node.x} y={node.y + (node.y > 72 ? -6 : 7)} fill="rgba(232,237,246,.72)" fontSize="2.5" textAnchor="middle" fontFamily="ui-monospace, monospace">{node.label}</text></g>; })}
      </svg>
      <div className="absolute left-4 top-4 rounded-lg border border-line bg-base-950/72 px-3 py-2 backdrop-blur"><div className="mono text-[8px] uppercase text-ink-faint">External surface</div><div className="mt-1 text-lg font-medium text-ink">{current.metric}</div></div>
      <div key={scene} className="absolute inset-x-4 bottom-4 animate-rise-in rounded-xl border border-line bg-base-950/88 p-4 backdrop-blur-xl"><div className="flex items-center justify-between"><div className="mono text-[9px] uppercase tracking-wider text-signal">{current.time} · {current.label}</div><div className="mono text-[8px] text-ink-faint">{scene + 1} / {scenes.length}</div></div><div className="mt-2 text-base font-medium text-ink">{current.title}</div><p className="mt-1 text-[11px] leading-5 text-ink-soft">{current.detail}</p><div className="mono mt-3 flex items-center gap-2 text-[8px] text-accent"><span className="h-1 w-1 rounded-full bg-accent"/>{current.evidence}</div></div>
    </div>
    <div className="flex items-center gap-3 border-t border-line px-4 py-3"><button onClick={() => setPlaying((value) => !value)} aria-label={playing ? "Pause story" : "Play story"} className="mono grid h-7 w-7 place-items-center rounded-lg border border-line text-[9px] text-ink-soft hover:border-signal/30 hover:text-signal">{playing ? "Ⅱ" : "▶"}</button><div className="flex flex-1 gap-1">{scenes.map((item, index) => <button key={item.label} onClick={() => { setScene(index); setPlaying(false); }} className="group flex-1" aria-label={`Show ${item.label}`}><span className={`block h-1 rounded-full transition ${index <= scene ? "bg-signal" : "bg-base-600"}`}/><span className={`mono mt-1 hidden text-[7px] uppercase md:block ${index === scene ? "text-signal" : "text-ink-faint"}`}>{item.label}</span></button>)}</div><Link href="/scan?target=northstar&mode=demo&present=1" className="mono rounded-lg bg-signal px-3 py-2 text-[9px] font-semibold uppercase text-base-950">Open demo</Link></div>
  </div>;
}
