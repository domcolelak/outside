"use client";

import { useRouter } from "next/navigation";
import { useTranslator } from "@/lib/i18n/context";

export function LogoutButton() {
  const router = useRouter();
  const t = useTranslator();
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  };
  return (
    <button onClick={logout} className="mono rounded-md border border-line px-3 py-1.5 text-xs text-ink-soft transition hover:bg-base-700">
      {t.t("account", "signOut")}
    </button>
  );
}
