"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslator } from "@/lib/i18n/context";

type State = "working" | "auth" | "done" | "error";

export function AgencyInviteAccept() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const tr = useTranslator();
  const g = (key: Parameters<typeof tr.t<"agency">>[1]) => tr.t("agency", key);
  const [state, setState] = useState<State>("working");

  useEffect(() => {
    let redirectTimer: ReturnType<typeof setTimeout> | undefined;
    fetch("/api/agency/invites/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (response) => ({ response, data: await response.json() }))
      .then(({ response, data }) => {
        if (response.status === 401) return setState("auth");
        if (!response.ok) return setState("error");
        setState("done");
        redirectTimer = setTimeout(
          () => router.push(data.kind === "client_portal" ? `/agency/portal?agencyId=${data.agencyId}&clientId=${data.clientId}` : "/agency"),
          900,
        );
      })
      .catch(() => setState("error"));
    return () => { if (redirectTimer) clearTimeout(redirectTimer); };
  }, [router, token]);

  return (
    <div className="panel max-w-md p-8 text-center">
      {state === "working" && <p className="text-sm text-ink-soft">{g("inviteValidating")}</p>}
      {state === "auth" && <><p className="text-sm text-ink-soft">{g("inviteSignInPrompt")}</p><Link className="mt-5 inline-block rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-base-950" href={`/login?next=/agency/invite/${token}`}>{g("inviteSignIn")}</Link></>}
      {state === "done" && <><div className="text-3xl text-signal">✓</div><p className="mt-2 text-sm text-ink">{g("inviteAccepted")}</p></>}
      {state === "error" && <p className="text-sm text-risk-high">{g("inviteAcceptFailed")}</p>}
    </div>
  );
}
