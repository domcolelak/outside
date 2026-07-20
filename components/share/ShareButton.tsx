"use client";

import { useState } from "react";
import type { ScanResult } from "@/lib/types";

/** Turns a finished scan into a shareable, unlisted report link (the growth loop). */
export function ShareButton({ result }: { result: ScanResult }) {
  const [state, setState] = useState<"idle" | "creating" | "done" | "error">("idle");
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const create = async () => {
    if (state === "creating") return;
    setState("creating");
    try {
      const res = await fetch("/api/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ result }) });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error();
      setUrl(data.url);
      setState("done");
      copy(data.url);
    } catch {
      setState("error");
    }
  };

  const copy = (value: string) => {
    navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {});
  };

  if (state === "done") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-line bg-base-850 p-1.5">
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="mono min-w-0 flex-1 bg-transparent px-2 text-[11px] text-ink-soft outline-none" />
        <button onClick={() => copy(url)} className="mono flex-none rounded-md bg-signal px-3 py-1.5 text-[11px] font-semibold text-base-950">{copied ? "Copied" : "Copy"}</button>
      </div>
    );
  }

  return (
    <button
      onClick={create}
      disabled={state === "creating"}
      className="mono w-full rounded-xl border border-line px-4 py-2.5 text-left text-xs text-ink-soft transition hover:bg-base-700/40 disabled:opacity-60"
    >
      {state === "creating" ? "Creating link…" : state === "error" ? "Couldn't create link — retry" : "↗ Share this report"}
    </button>
  );
}
