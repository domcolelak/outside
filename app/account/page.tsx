import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { Wordmark } from "@/components/Wordmark";
import { LogoutButton } from "@/components/account/AccountControls";
import { MonitorsPanel } from "@/components/account/MonitorsPanel";

export const dynamic = "force-dynamic";

const PLAN_LABEL: Record<string, string> = { free: "Snapshot (Free)", professional: "Professional", agency: "Agency" };

export default async function AccountPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");

  const primary = ctx.memberships[0];

  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/"><Wordmark className="h-6" /></Link>
          <div className="flex items-center gap-3">
            <Link href="/scan?target=northstar&mode=demo" className="mono text-xs text-ink-soft hover:text-ink">Run a scan</Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
        <div>
          <div className="mono text-[11px] uppercase tracking-widest text-signal">Workspace</div>
          <h1 className="mt-2 text-3xl font-semibold text-ink">Welcome, {ctx.user.name.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-ink-soft">{ctx.user.email}</p>
        </div>

        <section>
          <div className="mono mb-3 text-[11px] uppercase tracking-wider text-ink-faint">Organizations</div>
          <div className="grid gap-3 md:grid-cols-2">
            {ctx.memberships.map((m) => (
              <div key={m.org.id} className="panel flex items-center justify-between p-4">
                <div>
                  <div className="text-ink">{m.org.name}</div>
                  <div className="mono mt-1 text-[11px] text-ink-faint">{PLAN_LABEL[m.org.plan] ?? m.org.plan} · {m.role}</div>
                </div>
                <Link href="/billing" className="mono rounded-md border border-line px-2.5 py-1 text-[11px] text-ink-soft hover:bg-base-700">Billing</Link>
              </div>
            ))}
          </div>
        </section>

        {primary && <MonitorsPanel orgId={primary.org.id} plan={primary.org.plan} />}
      </main>
    </div>
  );
}
