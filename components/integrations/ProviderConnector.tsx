"use client";

import { useTranslator } from "@/lib/i18n/context";
import { providerSummaryKey } from "@/lib/integrations/providers/text";

import { useCallback, useEffect, useRef, useState } from "react";
import { joinCredentialPair, joinCredentialParts } from "@/lib/integrations/pair-credential";

export interface ProviderDescriptor {
  id: string;
  name: string;
  summary: string;
  docsUrl: string;
  keyPlaceholder: string;
  /** What the credential looks like, which decides how many fields to collect. */
  credentialKind?:
    | "api_key"
    | "id_secret"
    | "tenant_client_secret"
    | "service_account_json"
    | "service_account_json_subject";
  blocked?: { reason: string };
}

interface Capability {
  id: string;
  label: string;
  available: boolean;
  detail?: string;
}
interface Usage {
  total: number;
  failures: number;
  lastUsedAt?: string;
  lastErrorCode?: string;
  scanRuns: number;
  lastScanAt?: string;
}
interface HistoryEntry {
  action: string;
  actorId: string;
  detail?: string;
  createdAt: string;
}
interface Status {
  stored: boolean;
  connected: boolean;
  history?: HistoryEntry[];
  accountHint?: string;
  accountLabel?: string;
  connectedAt?: string;
  lastValidatedAt?: string;
  capabilities?: Capability[];
  usage?: Usage;
  blocked?: { reason: string };
  error?: { code: string; message: string; retryAfterSeconds?: number };
}

type Busy = "" | "load" | "save" | "delete";
type LoadState = "loading" | "ready" | "error";

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
 * One connector UI for every BYOK provider. A stored key is never returned to
 * the browser. Initial status loading is read-only; an explicit connection test
 * asks the server to refresh provider health.
 */
export function ProviderConnector({
  descriptor,
  orgId,
}: {
  descriptor: ProviderDescriptor;
  orgId: string;
}) {
  const tr = useTranslator();
  const n = (key: Parameters<typeof tr.t<"integrations">>[1], values?: Record<string, string | number>) =>
    tr.t("integrations", key, values);
  // The same description the page shows, resolved here too. This component
  // renders for anyone who *can* connect, so leaving it on descriptor.summary
  // meant an admin — the one person who acts on it — read English.
  const summaryKey = providerSummaryKey(descriptor.id);
  const summary = summaryKey ? n(summaryKey) : descriptor.summary;
  const titleId = `provider-${descriptor.id}-title`;
  const helpId = `provider-${descriptor.id}-help`;
  const loadErrorId = `provider-${descriptor.id}-load-error`;
  const actionErrorId = `provider-${descriptor.id}-action-error`;
  const initialStatus = descriptor.blocked
    ? {
        stored: false,
        connected: false,
        blocked: descriptor.blocked,
      }
    : null;
  const [status, setStatus] = useState<Status | null>(initialStatus);
  const [loadState, setLoadState] = useState<LoadState>(
    descriptor.blocked ? "ready" : "loading",
  );
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState("");
  // Pair providers (Censys) collect a non-secret identifier alongside the secret.
  // Microsoft providers collect a directory and an application identifier too.
  const isTriple = descriptor.credentialKind === "tenant_client_secret";
  // Google keys are a whole file, so they get a textarea rather than a one-line
  // input; Workspace additionally needs the administrator to impersonate.
  const isJson =
    descriptor.credentialKind === "service_account_json" || descriptor.credentialKind === "service_account_json_subject";
  const needsSubject = descriptor.credentialKind === "service_account_json_subject";
  const isPair = descriptor.credentialKind === "id_secret" || isTriple;
  const [pairId, setPairId] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [subject, setSubject] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState<Busy>(descriptor.blocked ? "" : "load");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const articleRef = useRef<HTMLElement>(null);
  const keyInputRef = useRef<HTMLInputElement>(null);
  const replaceButtonRef = useRef<HTMLButtonElement>(null);
  const api = `/api/integrations/${encodeURIComponent(descriptor.id)}`;

  const load = useCallback(
    async (refresh = false) => {
      setBusy("load");
      setLoadError(null);
      setActionError(null);
      try {
        const query = new URLSearchParams({ orgId });
        if (refresh) query.set("refresh", "1");
        const response = await fetch(`${api}?${query.toString()}`, {
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error(
            await responseError(
              response,
              `Could not check ${descriptor.name}.`,
            ),
          );
        }
        setStatus((await response.json()) as Status);
        setLoadState("ready");
      } catch (error) {
        setLoadState("error");
        setLoadError(
          error instanceof Error
            ? error.message
            : `Could not check ${descriptor.name}.`,
        );
      } finally {
        setBusy("");
      }
    },
    [api, descriptor.name, orgId],
  );

  useEffect(() => {
    if (descriptor.blocked) return;
    const timer = window.setTimeout(() => void load(false), 0);
    return () => window.clearTimeout(timer);
  }, [load, descriptor.blocked]);

  useEffect(() => {
    if (editing) keyInputRef.current?.focus();
  }, [editing]);

  async function connect() {
    if (busy) return;
    const secret = key.trim();
    if (!secret) {
      setActionError(isPair ? n("connectorErrApiSecret") : n("connectorErrApiKey"));
      return;
    }
    if (isPair && !pairId.trim()) {
      setActionError(isTriple ? n("connectorErrClientId") : n("connectorErrApiId"));
      return;
    }
    if (isTriple && !tenantId.trim()) {
      setActionError(n("connectorErrTenantId"));
      return;
    }
    if (needsSubject && !subject.trim()) {
      setActionError(n("connectorErrAdminAddress"));
      return;
    }
    // Stored as one value; the adapter that understands the shape splits it back.
    // One definition of the format, shared with that adapter.
    const normalizedKey = isTriple
      ? joinCredentialParts(tenantId, pairId, secret)
      : needsSubject
        ? // A newline separator leaves the pasted JSON byte-for-byte intact.
          `${subject.trim()}\n${secret}`
        : isPair
          ? joinCredentialPair(pairId, secret)
          : secret;
    setBusy("save");
    setActionError(null);
    try {
      const response = await fetch(api, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orgId, key: normalizedKey }),
      });
      if (!response.ok) {
        throw new Error(
          await responseError(
            response,
            `Could not connect ${descriptor.name}.`,
          ),
        );
      }
      setStatus((await response.json()) as Status);
      setLoadState("ready");
      setLoadError(null);
      setKey("");
      setPairId("");
      setTenantId("");
      setSubject("");
      setShowKey(false);
      setEditing(false);
      window.requestAnimationFrame(() => articleRef.current?.focus());
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : n("connectorErrNetworkSave"),
      );
    } finally {
      setBusy("");
    }
  }

  async function disconnect() {
    if (busy) return;
    if (
      !window.confirm(
        `Disconnect ${descriptor.name}? OUTSIDE will stop using this organization’s key until you reconnect it.`,
      )
    ) {
      return;
    }
    setBusy("delete");
    setActionError(null);
    try {
      const response = await fetch(
        `${api}?orgId=${encodeURIComponent(orgId)}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!response.ok) {
        throw new Error(
          await responseError(
            response,
            `Could not disconnect ${descriptor.name}.`,
          ),
        );
      }
      setStatus((await response.json()) as Status);
      setLoadState("ready");
      setLoadError(null);
      setEditing(false);
      setKey("");
      setPairId("");
      setTenantId("");
      setSubject("");
      setShowKey(false);
      window.requestAnimationFrame(() => articleRef.current?.focus());
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : n("connectorErrNetworkDelete"),
      );
    } finally {
      setBusy("");
    }
  }

  const blocked = status?.blocked ?? descriptor.blocked;
  const capabilityNeedsSetup =
    status?.connected &&
    status.capabilities?.some((capability) => !capability.available);
  const showForm =
    !blocked && loadState !== "loading" && (editing || !status?.stored);
  const badge =
    busy === "load" || loadState === "loading"
      ? n("connectorBadgeChecking")
      : loadState === "error"
        ? n("connectorBadgeStatusUnknown")
        : blocked
          ? n("connectorBadgeUnavailable")
          : capabilityNeedsSetup
            ? n("connectorBadgeSetupNeeded")
            : status?.connected
              ? n("connectorBadgeConnected")
              : status?.stored
                ? n("connectorBadgeAttention")
                : n("connectorBadgeNotConnected");
  const badgeClass =
    blocked || loadState === "error"
      ? "border-line text-ink-faint"
      : status?.connected && !capabilityNeedsSetup
        ? "border-signal/30 bg-signal/10 text-signal"
        : status?.stored || capabilityNeedsSetup
          ? "border-risk-medium/40 bg-risk-medium/5 text-risk-medium"
          : "border-line text-ink-faint";
  const describedBy = [
    helpId,
    loadError ? loadErrorId : null,
    actionError ? actionErrorId : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article
      ref={articleRef}
      tabIndex={-1}
      aria-labelledby={titleId}
      aria-busy={busy !== ""}
      className="panel p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 id={titleId} className="text-ink">
            {descriptor.name}
          </h4>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            {summary}
          </p>
        </div>
        <span
          role="status"
          aria-live="polite"
          className={`mono shrink-0 rounded-md border px-2 py-1 text-[11px] uppercase tracking-wide ${badgeClass}`}
        >
          {badge}
        </span>
      </div>

      {blocked && (
        <div className="mono mt-3 rounded-md border border-line bg-base-900 px-3 py-2 text-[12px] leading-5 text-ink-faint">
          {blocked.reason}
        </div>
      )}

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
        </div>
      )}

      {!blocked && status?.stored && !showForm && (
        <div className="mt-4 space-y-3">
          <div className="mono flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-faint">
            {status.accountHint && <span>Key {status.accountHint}</span>}
            {status.connected && status.accountLabel && (
              <span className="text-ink-soft">{status.accountLabel}</span>
            )}
            {status.lastValidatedAt && (
              <span>
                Last verified{" "}
                {new Date(status.lastValidatedAt).toLocaleString()}
              </span>
            )}
          </div>

          {status.connected && status.capabilities?.length ? (
            <ul className="space-y-1.5">
              {status.capabilities.map((capability) => (
                <li
                  key={capability.id}
                  className="mono text-[12px] leading-5 text-ink-faint"
                >
                  {capability.label}:{" "}
                  {capability.available ? (
                    <span className="text-signal">
                      {n("connectorCapAvailable")}
                      {capability.detail ? ` — ${capability.detail}` : ""}
                    </span>
                  ) : (
                    <span className="text-risk-medium">
                      {capability.detail ?? n("connectorCapNotAvailable")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}

          {!status.connected && (
            <div className="mono rounded-md border border-risk-medium/30 bg-risk-medium/5 px-3 py-2 text-[12px] leading-5 text-risk-medium">
              {status.error?.message ??
                n("connectorStoredKeyFailed")}
            </div>
          )}

          {status.history && status.history.length > 0 && (
            <details className="mt-1">
              <summary className="mono cursor-pointer text-[12px] text-ink-faint hover:text-ink-soft">
                {n("connectorCredentialHistory")}
              </summary>
              <ul className="mt-2 space-y-1">
                {status.history.map((entry) => (
                  <li key={`${entry.action}-${entry.createdAt}`} className="mono text-[11px] leading-5 text-ink-faint">
                    <span className="text-ink-soft">{entry.action}</span>
                    {" · "}
                    {tr.formatDate(entry.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                    {" · "}
                    <span title={n("connectorActingUser")}>{entry.actorId}</span>
                    {entry.detail && <span> · {entry.detail}</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {/* Gated on scanRuns, not on total: total counts lifecycle events like
              connecting and testing, so a provider that has never run in a scan —
              OpenAI never does, it answers explanation requests — would otherwise
              read a permanent "Used in 0 scans". */}
          {status.usage && status.usage.scanRuns > 0 && (
            <div className="mono text-[12px] leading-5 text-ink-faint">
              {n("connectorUsedInScans", { count: status.usage.scanRuns })}
              {status.usage.failures > 0 && (
                <span className="text-risk-medium">
                  {" "}
                  · {n("connectorFailedRuns", { count: status.usage.failures })}
                </span>
              )}
              {status.usage.lastScanAt && (
                <span>
                  {" "}
                  · {n("connectorLatestScan", { date: tr.formatDate(status.usage.lastScanAt, { dateStyle: "medium", timeStyle: "short" }) })}
                </span>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={busy !== ""}
              className="min-h-11 rounded-lg border border-line px-3 text-sm text-ink-soft transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:opacity-50"
            >
              {busy === "load" ? n("connectorTesting") : n("connectorTest")}
            </button>
            <button
              // Cancelling the replace form returns focus here, to the control
              // that opened it — not to whichever button happened to be first.
              ref={replaceButtonRef}
              type="button"
              onClick={() => {
                setEditing(true);
                setActionError(null);
              }}
              disabled={busy !== ""}
              className="min-h-11 rounded-lg border border-line px-3 text-sm text-ink-soft transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:opacity-50"
            >
              {n("connectorReplaceKey")}
            </button>
            <button
              type="button"
              onClick={() => void disconnect()}
              disabled={busy !== ""}
              className="min-h-11 rounded-lg border border-risk-high/30 px-3 text-sm text-risk-high transition hover:bg-risk-high/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-risk-high disabled:opacity-50"
            >
              {busy === "delete" ? n("connectorDisconnecting") : n("connectorDisconnect")}
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void connect();
          }}
          className="mt-4 rounded-lg border border-line bg-base-950/60 p-3"
          aria-describedby={describedBy}
        >
          {needsSubject && (
            <>
              <label
                htmlFor={`subject-${descriptor.id}`}
                className="mono block text-[12px] uppercase tracking-wide text-ink-faint"
              >
                {n("connectorAdminToImpersonate")}
              </label>
              <input
                id={`subject-${descriptor.id}`}
                type="email"
                value={subject}
                onChange={(event) => {
                  setSubject(event.target.value);
                  setActionError(null);
                }}
                placeholder={n("connectorAdminPlaceholder")}
                autoComplete="off"
                spellCheck={false}
                required
                aria-label={n("connectorAdminAria", { provider: descriptor.name })}
                className="mono mt-2 mb-3 min-h-11 w-full rounded-lg border border-line bg-base-900 px-3 text-sm text-ink placeholder:text-ink-faint focus-visible:border-signal/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
              />
            </>
          )}
          {isTriple && (
            <>
              <label
                htmlFor={`tenant-id-${descriptor.id}`}
                className="mono block text-[12px] uppercase tracking-wide text-ink-faint"
              >
                {n("connectorDirectoryTenantId")}
              </label>
              <input
                id={`tenant-id-${descriptor.id}`}
                type="text"
                value={tenantId}
                onChange={(event) => {
                  setTenantId(event.target.value);
                  setActionError(null);
                }}
                placeholder="00000000-0000-0000-0000-000000000000"
                autoComplete="off"
                spellCheck={false}
                required
                aria-label={n("connectorTenantAria", { provider: descriptor.name })}
                className="mono mt-2 mb-3 min-h-11 w-full rounded-lg border border-line bg-base-900 px-3 text-sm text-ink placeholder:text-ink-faint focus-visible:border-signal/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
              />
            </>
          )}
          {isPair && (
            <>
              <label
                htmlFor={`pair-id-${descriptor.id}`}
                className="mono block text-[12px] uppercase tracking-wide text-ink-faint"
              >
                {isTriple ? n("connectorAppClientId") : n("connectorApiId")}
              </label>
              <input
                id={`pair-id-${descriptor.id}`}
                type="text"
                value={pairId}
                onChange={(event) => {
                  setPairId(event.target.value);
                  setActionError(null);
                }}
                placeholder={isTriple ? "00000000-0000-0000-0000-000000000000" : n("connectorApiId")}
                autoComplete="off"
                spellCheck={false}
                required
                aria-label={isTriple ? n("connectorClientIdAria", { provider: descriptor.name }) : n("connectorApiIdAria", { provider: descriptor.name })}
                className="mono mt-2 mb-3 min-h-11 w-full rounded-lg border border-line bg-base-900 px-3 text-sm text-ink placeholder:text-ink-faint focus-visible:border-signal/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
              />
            </>
          )}
          <label
            htmlFor={`key-${descriptor.id}`}
            className="mono block text-[12px] uppercase tracking-wide text-ink-faint"
          >
            {isJson ? n("connectorServiceAccountJson") : isTriple ? n("connectorClientSecret") : isPair ? n("connectorApiSecret") : n("connectorApiKey")}
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            {isJson ? (
              /* A key file is multi-line and pasted verbatim, so it gets a
                 textarea. It is not masked: hiding a blob the customer just
                 copied helps nobody, and it never leaves this form unmasked. */
              <textarea
                id={`key-${descriptor.id}`}
                value={key}
                onChange={(event) => {
                  setKey(event.target.value);
                  setActionError(null);
                }}
                rows={6}
                placeholder={descriptor.keyPlaceholder}
                autoComplete="off"
                spellCheck={false}
                required
                aria-label={n("connectorJsonAria", { provider: descriptor.name })}
                aria-invalid={actionError ? true : undefined}
                className="mono min-w-0 flex-1 rounded-lg border border-line bg-base-900 p-3 text-[12px] leading-5 text-ink placeholder:text-ink-faint focus-visible:border-signal/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
              />
            ) : (
              <input
                ref={keyInputRef}
                id={`key-${descriptor.id}`}
                type={showKey ? "text" : "password"}
                value={key}
                onChange={(event) => {
                  setKey(event.target.value);
                  setActionError(null);
                }}
                placeholder={isPair ? n("connectorApiSecret") : descriptor.keyPlaceholder}
                autoComplete="off"
                spellCheck={false}
                required
                aria-label={isPair ? n("connectorSecretAria", { provider: descriptor.name }) : n("connectorKeyAria", { provider: descriptor.name })}
                aria-invalid={actionError ? true : undefined}
                className="mono min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-base-900 px-3 text-sm text-ink placeholder:text-ink-faint focus-visible:border-signal/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
              />
            )}
            {!isJson && (
            <button
              type="button"
              onClick={() => setShowKey((visible) => !visible)}
              aria-pressed={showKey}
              aria-label={n(isPair ? (showKey ? "connectorHideSecretAria" : "connectorShowSecretAria") : (showKey ? "connectorHideKeyAria" : "connectorShowKeyAria"), { provider: descriptor.name })}
              className="min-h-11 rounded-lg border border-line px-3 text-sm text-ink-soft transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
            >
              {showKey ? n("connectorHideKey") : n("connectorShowKey")}
            </button>
            )}
          </div>
          <p id={helpId} className="mt-2 text-xs leading-5 text-ink-faint">
            <a
              href={descriptor.docsUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
            >
              {n("connectorOpenKeySetup", { provider: descriptor.name })}
            </a>
            . {n("connectorKeyStorageNote")}
            {loadState === "error" &&
              ` ${n("connectorStatusUnknownWarning")}`}
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
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="submit"
              aria-label={n(status?.stored ? "connectorVerifyReplaceAria" : "connectorVerifyConnectAria", { provider: descriptor.name })}
              disabled={busy !== "" || key.trim().length === 0}
              className="min-h-11 rounded-lg border border-signal/40 bg-signal/10 px-4 text-sm font-medium text-signal transition hover:bg-signal/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:opacity-50"
            >
              {busy === "save"
                ? n("connectorVerifying")
                : status?.stored
                  ? n("connectorVerifyReplace")
                  : n("connectorVerifyConnect")}
            </button>
            {status?.stored && (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setKey("");
                  setPairId("");
                  setTenantId("");
                  setSubject("");
                  setShowKey(false);
                  setActionError(null);
                  window.requestAnimationFrame(() =>
                    replaceButtonRef.current?.focus(),
                  );
                }}
                disabled={busy !== ""}
                className="min-h-11 rounded-lg border border-line px-3 text-sm text-ink-soft transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:opacity-50"
              >
                {n("connectorCancel")}
              </button>
            )}
          </div>
        </form>
      )}

      {actionError && !showForm && (
        <p
          id={actionErrorId}
          role="alert"
          className="mt-3 text-sm text-risk-high"
        >
          {actionError}
        </p>
      )}

      {busy !== "" && (
        <span className="sr-only" role="status" aria-live="polite">
          {busy === "load"
            ? n("connectorSrChecking", { provider: descriptor.name })
            : busy === "save"
              ? n("connectorSrSaving", { provider: descriptor.name })
              : n("connectorSrDisconnecting", { provider: descriptor.name })}
        </span>
      )}
    </article>
  );
}
