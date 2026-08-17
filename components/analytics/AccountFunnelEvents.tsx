"use client";

import { useEffect } from "react";
import { trackFunnel } from "@/lib/analytics/client";

export function AccountFunnelEvents({ emailVerified, checkoutCompleted }: { emailVerified: boolean; checkoutCompleted: boolean }) {
  useEffect(() => {
    if (emailVerified) trackFunnel("email_verified");
    if (checkoutCompleted) trackFunnel("checkout_completed");
  }, [checkoutCompleted, emailVerified]);
  return null;
}
