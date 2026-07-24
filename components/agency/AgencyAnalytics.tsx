"use client";
import { useCallback, useEffect, useState } from "react";

type BillingClient = {
  id: string;
  name: string;
  mode: string;
  monthlyPriceCents: number | null;
  currency: string;
  serviceTier: string;
};
type Data = {
  series: Array<{
    date: string;
    scans: number;
    reports: number;
    api: number;
    changes: number;
  }>;
  utilization: {
    activeClients: number;
    totalClients: number;
    activeSeats: number;
    pendingJobs: number;
    reports: number;
    apiCalls: number;
  };
  billing: {
    revenueByCurrency: Record<string, number>;
    clientCountByMode: Record<string, number>;
    clients: BillingClient[];
  };
  reseller: {
    parent: { id: string; name: string } | null;
    children: Array<{ id: string; name: string }>;
  };
};

export function AgencyAnalytics({
  agencyId,
  canManageBilling,
}: {
  agencyId: string;
  canManageBilling: boolean;
}) {
  const [data, setData] = useState<Data | null>(null);
  const load = useCallback(
    () =>
      fetch(`/api/agency/analytics?agencyId=${agencyId}`)
        .then((response) => response.json())
        .then(setData),
    [agencyId],
  );
  useEffect(() => {
    void load();
  }, [load]);
  if (!data)
    return (
      <section className="panel p-5 text-sm text-ink-faint">
        Loading usage analytics…
      </section>
    );
  const maximum = Math.max(
    1,
    ...data.series.map(
      (item) => item.scans + item.reports + item.api + item.changes,
    ),
  );
  async function updateBilling(
    event: React.FormEvent<HTMLFormElement>,
    clientId: string,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/agency/billing?agencyId=${agencyId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId,
        billingMode: form.get("mode"),
        monthlyPriceCents: Math.round(Number(form.get("price")) * 100),
        currency: form.get("currency"),
      }),
    });
    if (response.ok) await load();
  }
  return (
    <section className="grid gap-6 xl:grid-cols-[1.3fr_.7fr]">
      <div className="panel p-5">
        <div className="flex justify-between">
          <div>
            <h2 className="text-lg font-medium">Usage analytics</h2>
            <p className="mt-1 text-xs text-ink-faint">
              Portfolio operations over the last 30 days.
            </p>
          </div>
          <div className="mono text-[9px] text-ink-faint">
            {data.utilization.apiCalls} API calls · {data.utilization.reports}{" "}
            reports
          </div>
        </div>
        <div
          className="mt-6 flex h-32 items-end gap-1"
          role="img"
          aria-label={`Thirty-day activity chart with ${data.utilization.apiCalls} API calls and ${data.utilization.reports} reports`}
        >
          {data.series.map((point) => (
            <div
              key={point.date}
              title={`${point.date}: ${point.scans} scans, ${point.reports} reports, ${point.api} API, ${point.changes} changes`}
              className="min-w-0 flex-1 rounded-t bg-signal/50"
              style={{
                height: `${Math.max(3, ((point.scans + point.reports + point.api + point.changes) / maximum) * 100)}%`,
              }}
            />
          ))}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-sm border border-line p-3">
            <b>
              {data.utilization.activeClients}/{data.utilization.totalClients}
            </b>
            <div className="text-[9px] text-ink-faint">active clients</div>
          </div>
          <div className="rounded-sm border border-line p-3">
            <b>{data.utilization.activeSeats}</b>
            <div className="text-[9px] text-ink-faint">active seats</div>
          </div>
          <div className="rounded-sm border border-line p-3">
            <b>{data.utilization.pendingJobs}</b>
            <div className="text-[9px] text-ink-faint">queued jobs</div>
          </div>
        </div>
      </div>
      <div className="panel p-5">
        <h2 className="text-lg font-medium">Billing hierarchy</h2>
        <div className="mt-4 space-y-2">
          {Object.entries(data.billing.revenueByCurrency).map(
            ([currency, cents]) => (
              <div
                key={currency}
                className="flex justify-between rounded-sm border border-line p-3 text-sm"
              >
                <span>Managed MRR</span>
                <b>
                  {(cents / 100).toLocaleString()} {currency}
                </b>
              </div>
            ),
          )}
        </div>
        <div className="mt-4 text-xs text-ink-soft">
          {data.reseller.parent
            ? `Resold by ${data.reseller.parent.name}`
            : "Direct agency workspace"}{" "}
          · {data.reseller.children.length} downstream reseller workspace(s)
        </div>
        {canManageBilling && (
          <a
            href={`/api/agency/billing/export?agencyId=${agencyId}`}
            className="mt-5 inline-block rounded-sm border border-signal/30 px-3 py-2 text-xs text-signal"
          >
            Export billing CSV
          </a>
        )}
      </div>
      {canManageBilling && (
        <div className="panel p-5 xl:col-span-2">
          <h2 className="text-lg font-medium">Client billing management</h2>
          <div className="mt-4 grid gap-2">
            {data.billing.clients.map((client) => (
              <form
                key={client.id}
                onSubmit={(event) => updateBilling(event, client.id)}
                className="grid items-center gap-2 rounded-sm border border-line p-3 md:grid-cols-[1fr_140px_120px_80px_auto]"
              >
                <span className="text-sm">
                  {client.name}
                  <small className="ml-2 text-ink-faint">
                    {client.serviceTier}
                  </small>
                </span>
                <select
                  aria-label={`Billing mode for ${client.name}`}
                  name="mode"
                  defaultValue={client.mode}
                  className="rounded-sm border border-line bg-base-950 px-2 py-1 text-xs"
                >
                  <option value="agency">Agency paid</option>
                  <option value="direct">Client direct</option>
                  <option value="reseller">Reseller</option>
                </select>
                <input
                  aria-label={`Monthly price for ${client.name}`}
                  name="price"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={(client.monthlyPriceCents ?? 0) / 100}
                  className="rounded-sm border border-line bg-base-950 px-2 py-1 text-xs"
                />
                <input
                  aria-label={`Currency for ${client.name}`}
                  name="currency"
                  maxLength={3}
                  defaultValue={client.currency}
                  className="rounded-sm border border-line bg-base-950 px-2 py-1 text-xs"
                />
                <button className="rounded-sm border border-signal/30 px-3 py-1 text-xs text-signal">
                  Save
                </button>
              </form>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
