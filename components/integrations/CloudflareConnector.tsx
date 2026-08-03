"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DmarcRemediation } from "./DmarcRemediation";

interface Zone {
  id: string;
  name: string;
}
interface Connection {
  accountHint: string;
  zones: Zone[];
  connectedAt: string;
}

type LoadState = "loading" | "ready" | "error";
type Busy = "" | "load" | "save" | "delete";

async function responseError(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const data = (await response.json()) as { error?: unknown };
    return typeof data.error === "string" && data.error.trim()
      ? data.error
      : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Connect a customer's scoped Cloudflare token. The token is verified and sent
 * once, then only a non-secret account hint and permitted zones return.
 */
export function CloudflareConnector({
  orgId,
  orgName,
}: {
  orgId: string;
  orgName: string;
}) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [busy, setBusy] = useState<Busy>("load");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [allowUnknownReplace, setAllowUnknownReplace] = useState(false);
  const helpId = "cloudflare-token-help";
  const loadErrorId = "cloudflare-load-error";
  const actionErrorId = "cloudflare-action-error";
  const connectorRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (refresh = false) => {
    setBusy("load");
    setAllowUnknownReplace(false);
    setLoadError(null);
    setActionError(null);
    try {
      const query = new URLSearchParams({ orgId });
      if (refresh) query.set("refresh", "1");
      const response = await fetch(
        `/api/integrations/cloudflare?${query.toString()}`,
        { credentials: "include" },
      );
      if (!response.ok) {
        throw new Error(
          await responseError(
            response,
            "Could not check the Cloudflare connection.",
          ),
        );
      }
      const data = (await response.json()) as {
        connection?: Connection | null;
      };
      setConnection(data.connection ?? null);
      setLoadState("ready");
    } catch (error) {
      setLoadState("error");
      setLoadError(
        error instanceof Error
          ? error.message
          : "Could not check the Cloudflare connection.",
      );
    } finally {
      setBusy("");
    }
  }, [orgId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function connect(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      setActionError("Enter a Cloudflare API token.");
      return;
    }
    setBusy("save");
    setActionError(null);
    try {
      const response = await fetch("/api/integrations/cloudflare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orgId, token: normalizedToken }),
      });
      if (!response.ok) {
        throw new Error(
          await responseError(response, "Could not connect Cloudflare."),
        );
      }
      const data = (await response.json()) as { connection: Connection };
      setConnection(data.connection);
      setLoadState("ready");
      setLoadError(null);
      setToken("");
      setShowToken(false);
      window.requestAnimationFrame(() => connectorRef.current?.focus());
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Network error. Nothing was saved.",
      );
    } finally {
      setBusy("");
    }
  }

  async function disconnect() {
    if (busy) return;
    if (
      !window.confirm(
        `Disconnect Cloudflare from ${orgName}? Active OUTSIDE remediations must be rolled back first. If none are active, OUTSIDE will lose its DNS access immediately.`,
      )
    ) {
      return;
    }
    setBusy("delete");
    setActionError(null);
    try {
      const response = await fetch(
        `/api/integrations/cloudflare?orgId=${encodeURIComponent(orgId)}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!response.ok) {
        throw new Error(
          await responseError(response, "Could not disconnect Cloudflare."),
        );
      }
      setConnection(null);
      setLoadState("ready");
      setLoadError(null);
      window.requestAnimationFrame(() => connectorRef.current?.focus());
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Network error. The connection was not removed.",
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <div
      ref={connectorRef}
      tabIndex={-1}
      className="mt-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
      aria-busy={busy !== ""}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="mono text-[12px] text-ink-faint">Organization</span>
        <strong className="text-sm font-medium text-ink">{orgName}</strong>
        <span
          role="status"
          aria-live="polite"
          className={`mono ml-auto rounded-md border px-2.5 py-1 text-[11px] uppercase tracking-wide ${
            loadState === "error"
              ? "border-line text-ink-faint"
              : connection
                ? "border-signal/30 bg-signal/10 text-signal"
                : "border-line text-ink-faint"
          }`}
        >
          {busy === "load" || loadState === "loading"
            ? "Checking…"
            : loadState === "error"
              ? "Status unknown"
              : connection
                ? "Connected"
                : "Not connected"}
        </span>
      </div>

      {loadError && (
        <div
          id={loadErrorId}
          role="alert"
          className="mt-3 rounded-lg border border-risk-medium/30 bg-risk-medium/5 p-3"
        >
          <p className="text-sm text-risk-medium">{loadError}</p>
          <button
            type="button"
            onClick={() => void load(false)}
            disabled={busy !== ""}
            className="mt-3 min-h-11 rounded-lg border border-line px-3 text-sm text-ink-soft transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:opacity-50"
          >
            Retry status check
          </button>
          {!connection && (
            <button
              type="button"
              onClick={() => setAllowUnknownReplace(true)}
              disabled={busy !== ""}
              className="ml-2 mt-3 min-h-11 rounded-lg border border-risk-high/30 px-3 text-sm text-risk-high transition hover:bg-risk-high/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-risk-high disabled:opacity-50"
            >
              Replace or connect anyway
            </button>
          )}
        </div>
      )}

      {loadState !== "loading" && connection ? (
        <div className="mt-3 rounded-lg border border-signal/30 bg-signal/5 p-3">
          <div className="mono flex flex-wrap items-center gap-x-2 text-[12px] text-signal">
            <span>Connected for {orgName}</span>
            <span className="text-ink-faint">· {connection.accountHint}</span>
          </div>
          <div className="mt-2 text-sm text-ink-soft">
            {connection.zones.length} zone
            {connection.zones.length === 1 ? "" : "s"} this token can act on:
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {connection.zones.map((zone) => (
              <span
                key={zone.id}
                className="mono rounded-sm border border-line px-2 py-1 text-[11px] text-ink-soft"
              >
                {zone.name}
              </span>
            ))}
          </div>
          {actionError && (
            <p role="alert" className="mt-3 text-sm text-risk-high">
              {actionError}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={busy !== ""}
              className="min-h-11 rounded-lg border border-line px-3 text-sm text-ink-soft transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:opacity-50"
            >
              {busy === "load" ? "Checking…" : "Refresh status"}
            </button>
            <button
              type="button"
              onClick={() => void disconnect()}
              disabled={busy !== ""}
              className="min-h-11 rounded-lg border border-risk-high/30 px-3 text-sm text-risk-high transition hover:bg-risk-high/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-risk-high disabled:opacity-50"
            >
              {busy === "delete" ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
          {loadState === "error" && (
            <p className="mt-3 text-xs leading-5 text-ink-faint">
              Remediation controls are paused until the connection status can be
              checked.
            </p>
          )}
          <fieldset
            disabled={loadState !== "ready" || busy !== ""}
            className="m-0 min-w-0 border-0 p-0 disabled:opacity-60"
          >
            <DmarcRemediation orgId={orgId} />
          </fieldset>
        </div>
      ) : loadState === "ready" || allowUnknownReplace ? (
        <form
          onSubmit={connect}
          className="mt-3 rounded-lg border border-line bg-base-950/60 p-3"
          aria-describedby={[
            helpId,
            loadError ? loadErrorId : null,
            actionError ? actionErrorId : null,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className="text-sm font-medium text-ink">
            Connect Cloudflare for {orgName}
          </div>
          <label
            htmlFor="cf-token"
            className="mono mt-3 block text-[12px] uppercase tracking-wide text-ink-faint"
          >
            Cloudflare API token
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="cf-token"
              type={showToken ? "text" : "password"}
              value={token}
              onChange={(event) => {
                setToken(event.target.value);
                setActionError(null);
              }}
              placeholder="Paste your scoped token"
              autoComplete="off"
              spellCheck={false}
              required
              aria-invalid={actionError ? true : undefined}
              className="mono min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-base-900 px-3 text-sm text-ink placeholder:text-ink-faint focus-visible:border-signal/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
            />
            <button
              type="button"
              onClick={() => setShowToken((visible) => !visible)}
              aria-pressed={showToken}
              className="min-h-11 rounded-lg border border-line px-3 text-sm text-ink-soft transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
            >
              {showToken ? "Hide token" : "Show token"}
            </button>
          </div>
          <p id={helpId} className="mt-2 text-xs leading-5 text-ink-faint">
            Create a scoped token under Cloudflare{" "}
            <span className="text-ink-soft">My Profile → API Tokens</span> with{" "}
            <span className="text-ink-soft">Zone:Read</span> and{" "}
            <span className="text-ink-soft">DNS:Edit</span> only for the zones
            you want OUTSIDE to manage. The token is encrypted and never shown
            again.
            {allowUnknownReplace &&
              " You explicitly chose to continue while status is unknown. Saving this token may replace an existing connection."}
          </p>
          {actionError && (
            <p
              id={actionErrorId}
              role="alert"
              className="mt-2 text-sm text-risk-high"
            >
              {actionError}
            </p>
          )}
          <button
            type="submit"
            disabled={busy !== "" || token.trim().length === 0}
            className="mt-3 min-h-11 rounded-lg border border-signal/40 bg-signal/10 px-4 text-sm font-medium text-signal transition hover:bg-signal/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:opacity-50"
          >
            {busy === "save"
              ? "Verifying with Cloudflare…"
              : "Verify and connect"}
          </button>
        </form>
      ) : loadState === "loading" ? (
        <div className="mt-3 min-h-11" role="status" aria-live="polite">
          <span className="text-sm text-ink-faint">
            Checking Cloudflare connection…
          </span>
        </div>
      ) : null}
      {busy !== "" && (
        <span className="sr-only" role="status" aria-live="polite">
          {busy === "load"
            ? "Checking Cloudflare"
            : busy === "save"
              ? "Saving Cloudflare"
              : "Disconnecting Cloudflare"}
        </span>
      )}
    </div>
  );
}
