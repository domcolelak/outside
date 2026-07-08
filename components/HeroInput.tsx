"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function HeroInput() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const go = (target: string, demo = false) => {
    const t = target.trim();
    if (!t) {
      setError("Enter a domain to map its external surface.");
      return;
    }
    router.push(`/scan?target=${encodeURIComponent(t)}${demo ? "&mode=demo" : ""}`);
  };

  return (
    <div className="w-full max-w-xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(value);
        }}
        className="panel flex items-center gap-2 p-2"
      >
        <span className="mono pl-3 text-ink-faint">https://</span>
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder="yourcompany.com"
          spellCheck={false}
          autoComplete="off"
          className="mono flex-1 bg-transparent py-3 text-ink placeholder:text-ink-faint focus:outline-none"
        />
        <button
          type="submit"
          className="shrink-0 rounded-lg bg-signal px-4 py-3 text-sm font-semibold text-base-950 shadow-glow transition hover:bg-signal-bright"
        >
          See my external surface
        </button>
      </form>
      {error && <p className="mono mt-2 text-xs text-risk-high">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-ink-faint">Or watch a demo:</span>
        {[
          { slug: "northstar", name: "Northstar Labs" },
          { slug: "velora", name: "Velora Commerce" },
          { slug: "atlas", name: "Atlas Financial" },
        ].map((d) => (
          <button
            key={d.slug}
            onClick={() => go(d.slug, true)}
            className="mono rounded-md border border-line px-2.5 py-1 text-ink-soft transition hover:border-signal/40 hover:text-signal"
          >
            {d.name}
          </button>
        ))}
      </div>
      <p className="mono mt-3 text-[11px] text-ink-faint">
        Passive, public sources only · No login required for an external snapshot
      </p>
    </div>
  );
}
