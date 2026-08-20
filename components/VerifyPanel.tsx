"use client";

import { useEffect, useState } from "react";
import { trackFunnel } from "@/lib/analytics/client";
import { useDialogFocus } from "@/components/useDialogFocus";
import { useTranslator } from "@/lib/i18n/context";

interface StartInfo {
  recordType: string;
  recordName: string;
  recordValue: string;
  filePath?: string;
  fileUrl?: string;
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
  const tr = useTranslator();
  const u = (key: Parameters<typeof tr.t<"ui">>[1], values?: Record<string, string | number>) => tr.t("ui", key, values);
  const verificationStartFailed = u("verificationStartFailed");
  const [info, setInfo] = useState<StartInfo | null>(null);
  const [status, setStatus] = useState<"loading" | "pending" | "verified" | "checking" | "error">("loading");
  const [hint, setHint] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const dialogRef = useDialogFocus();

  useEffect(() => {
    trackFunnel("verification_started");
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain, action: "start" }), signal: controller.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(verificationStartFailed);
        if (data.status === "verified") {
          setStatus("verified");
          return;
        }
        setInfo(data);
        setStatus("pending");
      } catch (error) {
        if (controller.signal.aborted) return;
        setHint(verificationStartFailed);
        setStatus("error");
      }
    })();
    return () => controller.abort();
  }, [domain, verificationStartFailed]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const check = async () => {
    setStatus("checking");
    setHint(null);
    try {
      const res = await fetch("/api/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain, action: "check" }) });
      const data = await res.json();
      if (!res.ok) throw new Error(u("verificationCheckFailed"));
      if (data.status === "verified") {
        trackFunnel("domain_verified");
        setStatus("verified");
        setTimeout(onVerified, 900);
      } else {
        setStatus("pending");
        setHint(data.found === false ? u("txtNotFound") : u("notVerifiedYet"));
      }
    } catch (error) {
      setStatus("pending");
      setHint(u("verificationCheckFailed"));
    }
  };

  const copy = async () => {
    if (!info) return;
    try {
      await navigator.clipboard.writeText(info.recordValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setHint(u("clipboardDenied"));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-base-950/80 backdrop-blur-xs px-4" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="verify-title" tabIndex={-1} className="panel w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="mono text-[12px] uppercase tracking-wider text-signal">{u("verifyOrganization")}</div>
            <h3 id="verify-title" className="mt-1 text-lg text-ink">{u("proveOwnership", { domain })}</h3>
          </div>
          <button onClick={onClose} className="rounded-md border border-line px-2 py-1 text-xs text-ink-soft hover:bg-base-700">{u("close")}</button>
        </div>

        {status === "verified" ? (
          <div className="mt-6 rounded-xl border border-signal/40 bg-signal/10 p-5 text-center">
            <div className="text-2xl">✓</div>
            <div className="mt-1 text-lg text-signal">{u("verifiedOrganization")}</div>
            <p className="mt-1 text-sm text-ink-soft">{u("ownershipConfirmed", { domain })}</p>
          </div>
        ) : status === "error" ? (
          <div className="mt-6 rounded-xl border border-risk-high/30 bg-risk-high/5 p-5">
            <p role="alert" className="text-sm text-risk-high">{hint ?? verificationStartFailed}</p>
            <button onClick={onClose} className="mt-4 rounded-lg border border-line px-4 py-2 text-sm text-ink-soft">{u("closeTryAgain")}</button>
          </div>
        ) : (
          <>
            <p className="mt-4 text-sm leading-relaxed text-ink-soft">
              {info ? u("verificationInstructions") : u("preparingVerification")}
            </p>

            <div className="mt-4 space-y-2">
              <Field label={u("recordType")} value={info?.recordType ?? "TXT"} />
              <Field label={u("nameHost")} value={info?.recordName ?? domain} />
              <div>
                <div className="mono mb-1 text-[11px] uppercase tracking-wide text-ink-faint">{u("value")}</div>
                <div className="flex items-center gap-2">
                  <code className="mono flex-1 overflow-x-auto rounded-md border border-line bg-base-950 px-3 py-2 text-[12px] text-signal">
                    {info?.recordValue ?? "…"}
                  </code>
                  <button onClick={copy} disabled={!info} className="mono shrink-0 rounded-md border border-line px-3 py-2 text-xs text-ink-soft hover:bg-base-700 disabled:opacity-50">
                    {copied ? u("copied") : u("copy")}
                  </button>
                </div>
              </div>
            </div>

            {info?.filePath && (
              <div className="mt-3 rounded-md border border-line bg-base-850 px-3 py-2">
                <div className="mono text-[11px] uppercase tracking-wide text-ink-faint">{u("alternativeHostFile")}</div>
                <p className="mt-1 text-xs text-ink-soft">
                  {u("serveVerificationValue", { path: info.filePath })}
                </p>
              </div>
            )}

            {hint && <p role="status" className="mono mt-3 text-xs text-risk-medium">{hint}</p>}

            <div className="mt-5 flex items-center justify-between">
              <span className="mono text-[12px] text-ink-faint">{u("passiveWithoutVerification")}</span>
              <button
                onClick={check}
                disabled={!info || status === "checking"}
                className="rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-base-950 hover:bg-signal-bright disabled:opacity-60"
              >
                {status === "checking" ? u("checking") : u("checkVerification")}
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
      <span className="mono text-[11px] uppercase tracking-wide text-ink-faint">{label}</span>
      <span className="mono text-[12px] text-ink">{value}</span>
    </div>
  );
}
