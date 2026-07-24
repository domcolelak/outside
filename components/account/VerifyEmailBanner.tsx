"use client";

import { useState } from "react";

type Notice = "complete" | "invalid" | undefined;

/**
 * Shown on the workspace when the signed-in user has not verified their email.
 * Access is progressive: the account exists, but scanning, monitoring, reports,
 * invites, and Agency/Enterprise stay locked until verification. The banner
 * makes that explicit and lets the user resend the link.
 */
export function VerifyEmailBanner({ verified, email, notice }: { verified: boolean; email: string; notice?: Notice }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "limited" | "error">("idle");

  if (verified) {
    if (notice !== "complete") return null;
    return (
      <div className="panel flex items-center gap-3 border-signal/30 bg-signal/5 p-4">
        <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full border border-signal text-signal">✓</span>
        <p className="text-sm text-ink">Email verified — your workspace is fully unlocked.</p>
      </div>
    );
  }

  const resend = async () => {
    setState("sending");
    try {
      const res = await fetch("/api/auth/verify-email", { method: "POST" });
      setState(res.ok ? "sent" : res.status === 429 ? "limited" : "error");
    } catch {
      setState("error");
    }
  };

  const message = {
    idle: null,
    sending: "Sending…",
    sent: "Sent — check your inbox (and spam).",
    limited: "Too many requests. Try again in a little while.",
    error: "Could not send right now. Please try again.",
  }[state];

  return (
    <div className="panel border-risk-medium/40 bg-risk-medium/[0.06] p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border border-risk-medium text-[12px] text-risk-medium">!</span>
          <div>
            <p className="text-sm font-medium text-ink">Verify your email to unlock scanning, monitoring, and reports</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
              {notice === "invalid"
                ? "That verification link was invalid or expired. Send a fresh one below."
                : <>We sent a verification link to <span className="text-ink">{email}</span>. Verified-target scans, Guardian, invites, and Agency/Enterprise stay locked until you confirm it.</>}
            </p>
          </div>
        </div>
        <button
          onClick={resend}
          disabled={state === "sending" || state === "sent"}
          className="mono flex-none rounded-lg border border-risk-medium/50 px-4 py-2 text-xs text-risk-medium transition hover:bg-risk-medium/10 disabled:opacity-60"
        >
          {state === "sent" ? "Email sent" : state === "sending" ? "Sending…" : "Resend email"}
        </button>
      </div>
      {message && state !== "idle" && (
        <p className={`mono mt-3 text-[12px] ${state === "sent" ? "text-signal" : state === "error" || state === "limited" ? "text-risk-high" : "text-ink-faint"}`}>{message}</p>
      )}
    </div>
  );
}
