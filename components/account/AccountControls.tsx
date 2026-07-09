"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  };
  return (
    <button onClick={logout} className="mono rounded-md border border-line px-3 py-1.5 text-xs text-ink-soft transition hover:bg-base-700">
      Sign out
    </button>
  );
}
