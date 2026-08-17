"use client";

import { useEffect } from "react";
import { trackProductEvent } from "@/lib/analytics/client";

const CAMPAIGN_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
const SAFE_CODE = /^[a-z0-9][a-z0-9._~-]{0,79}$/i;

export function CampaignAttribution() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const data: Record<string, string> = {};
    for (const key of CAMPAIGN_KEYS) {
      const value = params.get(key)?.trim() ?? "";
      if (SAFE_CODE.test(value)) data[key] = value;
    }
    if (Object.keys(data).length) trackProductEvent("campaign_visit", data);
  }, []);
  return null;
}
