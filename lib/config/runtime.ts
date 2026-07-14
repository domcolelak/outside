/** Runtime values shared by server-side integrations and URL builders. */

const DEFAULT_APP_URL = "http://localhost:3000";

export function appUrl(): string {
  const configured = process.env.APP_URL?.trim();
  if (!configured) return DEFAULT_APP_URL;
  try {
    const url = new URL(configured);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("unsupported protocol");
    return url.origin;
  } catch {
    throw new Error("APP_URL must be an absolute http(s) URL.");
  }
}

/** Kept as a value export for existing billing imports. */
export const APP_URL = appUrl();
