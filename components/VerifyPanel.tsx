"use client";

import { useEffect, useState } from "react";

interface StartInfo {
  recordType: string;
  recordName: string;
  recordValue: string;
  instructions: string;
}

export function VerifyPanel({
  domain,
  onVerified,
  onClose,
}: {
  domain: string;
  onVerified: () => void;
  onClose: () => void;
}) {
  const [info, setInfo] = useState<StartInfo | null>(null);
  const [status, setStatus] = useState<"loading" | "pending" | "verified" | "checking">("loading");
  const [hint, setHint] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain, action: "start" }) });
      const data = await res.json();
      if (data.status === "verified") {
        setStatus("verified");
        return;
      }
      setInfo(data);
      setStatus("pending");
    })();
  }, [domain]);

  const check = async () => {
    setStatus("checking");
    setHint(null);
    const res = await fetch("/api/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain, action: "check" }) });
    const data = await res.json();
    if (data.status === "verified") {
      setStatus("verified");
      setTimeout(onVerified, 900);
    } else {
      setStatus("pending");
      setHint(data.found === false ? "TXT record not found yet. DNS can take a few minutes — try again shortly." : data.error ?? "Not verified yet.");
    }
  };

  const copy = () => {
    if (info) navigator.clipboard?.writeText(info.recordValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-base-950/80 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="panel w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="mono text-[11px] uppercase tracking-wider text-signal">Verify organization</div>
            <h3 className="mt-1 text-lg text-ink">Prove you own <span className="mono">{domain}</span></h3>
          </div>
          <button onClick={onClose} className="rounded-md border border-line px-2 py-1 text-xs text-ink-soft hover:bg-base-700">Close</button>
        </div>

        {status === "verified" ? (
          <div className="mt-6 rounded-xl border border-signal/40 bg-signal/10 p-5 text-center">
            <div className="text-2xl">✓</div>
            <div className="mt-1 text-lg text-signal">Verified organization</div>
            <p className="mt-1 text-sm text-ink-soft">Ownership of {domain} is confirmed. Monitoring and deeper inspection are unlocked.</p>
          </div>
        ) : (
          <>
            <p className="mt-4 text-sm leading-relaxed text-ink-soft">
              {info?.instructions ?? "Preparing your verification challenge…"}
            </p>

            <div className="mt-4 space-y-2">
              <Field label="Record type" value={info?.recordType ?? "TXT"} />
              <Field label="Name / host" value={info?.recordName ?? domain} />
              <div>
                <div className="mono mb-1 text-[10px] uppercase tracking-wide text-ink-faint">Value</div>
                <div className="flex items-center gap-2">
                  <code className="mono flex-1 overflow-x-auto rounded-md border border-line bg-base-950 px-3 py-2 text-[12px] text-signal">
                    {info?.recordValue ?? "…"}
                  </code>
                  <button onClick={copy} disabled={!info} className="mono shrink-0 rounded-md border border-line px-3 py-2 text-xs text-ink-soft hover:bg-base-700 disabled:opacity-50">
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            </div>

            {hint && <p className="mono mt-3 text-xs text-risk-medium">{hint}</p>}

            <div className="mt-5 flex items-center justify-between">
              <span className="mono text-[11px] text-ink-faint">Passive external view works without verification.</span>
              <button
                onClick={check}
                disabled={!info || status === "checking"}
                className="rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-base-950 hover:bg-signal-bright disabled:opacity-60"
              >
                {status === "checking" ? "Checking…" : "Check verification"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-line bg-base-850 px-3 py-2">
      <span className="mono text-[10px] uppercase tracking-wide text-ink-faint">{label}</span>
      <span className="mono text-[12px] text-ink">{value}</span>
    </div>
  );
}
