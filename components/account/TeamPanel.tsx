"use client";

import { useEffect, useState } from "react";
import { useTranslator } from "@/lib/i18n/context";

interface Invite {
  id: string;
  email: string;
  role: string;
}

export function TeamPanel({
  orgId,
  canInvite,
  canGrantAdmin,
  initialNotify,
}: {
  orgId: string;
  canInvite: boolean;
  canGrantAdmin: boolean;
  initialNotify: boolean;
}) {
  const tr = useTranslator();
  const a = (key: Parameters<typeof tr.t<"account">>[1], values?: Record<string, string | number>) => tr.t("account", key, values);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("analyst");
  const [error, setError] = useState<string | null>(null);
  const [notifyError, setNotifyError] = useState<string | null>(null);
  const [notify, setNotify] = useState(initialNotify);
  const [savingNotify, setSavingNotify] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);

  useEffect(() => {
    if (!canInvite) return;
    fetch(`/api/invites?orgId=${orgId}`).then((r) => (r.ok ? r.json() : { invites: [] })).then((d) => setInvites(d.invites ?? [])).catch(() => {});
  }, [orgId, canInvite]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSendingInvite(true);
    try {
      const res = await fetch("/api/invites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orgId, email, role }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? a("teamInviteFailed"));
      setEmail("");
      setInvites((i) => [{ id: data.invite.id, email: data.invite.email, role: data.invite.role }, ...i]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : a("teamInviteFailed"));
    } finally {
      setSendingInvite(false);
    }
  };

  const toggleNotify = async () => {
    const next = !notify;
    setNotify(next);
    setSavingNotify(true);
    setNotifyError(null);
    try {
      const response = await fetch("/api/account/notifications", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ orgId, enabled: next }) });
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error ?? a("notificationsFailed"));
      }
    } catch (cause) {
      setNotify(!next);
      setNotifyError(cause instanceof Error ? cause.message : a("notificationsFailed"));
    } finally {
      setSavingNotify(false);
    }
  };

  return (
    <section className="space-y-6">
      <div>
        <div className="mono mb-3 text-[12px] uppercase tracking-wider text-ink-faint">{a("notificationsHeading")}</div>
        <button
          onClick={() => void toggleNotify()}
          role="switch"
          aria-checked={notify}
          disabled={savingNotify}
          className="panel flex w-full items-center justify-between p-4 text-left hover:bg-base-700/40"
        >
          <div>
            <div className="text-sm text-ink">{a("notificationsChangeAlerts")}</div>
            <div className="mono mt-0.5 text-[12px] text-ink-faint">{a("notificationsChangeAlertsBody")}</div>
          </div>
          <span className={`relative h-5 w-9 rounded-full transition ${notify ? "bg-signal" : "bg-base-600"}`}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-base-950 transition ${notify ? "left-4" : "left-0.5"}`} />
          </span>
        </button>
        {notifyError && <p role="alert" className="mono mt-2 text-xs text-risk-high">{notifyError}</p>}
      </div>

      {canInvite && (
        <div>
          <div className="mono mb-3 text-[12px] uppercase tracking-wider text-ink-faint">{a("teamHeading")}</div>
          <form onSubmit={invite} className="panel mb-3 flex flex-wrap items-center gap-2 p-2">
            <input
              aria-label={a("teamEmailLabel")}
              aria-describedby={error ? "team-error" : undefined}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={a("teamEmailPlaceholder")}
              type="email"
              required
              className="mono min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-hidden"
            />
            <select aria-label={a("teamRoleLabel")} value={role} onChange={(e) => setRole(e.target.value)} className="mono rounded-md border border-line bg-base-950 px-2 py-2 text-xs text-ink-soft">
              {canGrantAdmin && <option value="admin">{a("roleAdmin")}</option>}
              <option value="analyst">{a("roleAnalyst")}</option>
              <option value="viewer">{a("roleViewer")}</option>
            </select>
            <button type="submit" disabled={sendingInvite} className="rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-base-950 hover:bg-signal-bright disabled:opacity-60">{sendingInvite ? a("teamInviting") : a("teamInvite")}</button>
          </form>
          {error && <p id="team-error" role="alert" className="mono mb-3 text-xs text-risk-high">{error}</p>}
          <div className="space-y-2">
            {invites.length === 0 && <div className="panel px-4 py-4 text-center text-xs text-ink-faint">{a("teamNoInvites")}</div>}
            {invites.map((i) => (
              <div key={i.id} className="panel flex items-center justify-between p-3">
                <span className="mono text-sm text-ink">{i.email}</span>
                <span className="mono rounded-md border border-line px-2 py-0.5 text-[12px] text-ink-soft">{i.role} · {a("teamPending")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
