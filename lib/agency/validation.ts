export const cleanText = (value: unknown, max: number) => typeof value === "string" ? value.trim().replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max) : "";
export const validSlug = (value: unknown) => cleanText(value, 60).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
export const validColor = (value: unknown, fallback: string) => /^#[0-9a-f]{6}$/i.test(String(value ?? "")) ? String(value) : fallback;
export const optionalHttpsUrl = (value: unknown): string | null => { const text = cleanText(value, 500); if (!text) return null; try { const url = new URL(text); return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null; } catch { return null; } };
export const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function notificationRouting(value: unknown, allowedChannelIds: ReadonlySet<string>) {
  const input = record(value); const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; const allowedSeverities = new Set(["critical", "high", "medium", "low", "info"]);
  const emails = [...new Set((Array.isArray(input.emails) ? input.emails : []).map((item) => cleanText(item, 254).toLowerCase()).filter((item) => emailPattern.test(item)))].slice(0, 20);
  const channelIds = [...new Set((Array.isArray(input.channelIds) ? input.channelIds : []).map((item) => cleanText(item, 100)).filter((item) => allowedChannelIds.has(item)))].slice(0, 20);
  const severities = [...new Set((Array.isArray(input.severities) ? input.severities : []).map((item) => cleanText(item, 20)).filter((item) => allowedSeverities.has(item)))].slice(0, 5);
  return { emails, channelIds, severities: severities.length ? severities : ["critical", "high"] };
}
