export const cleanText = (value: unknown, max: number) => typeof value === "string" ? value.trim().replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max) : "";
export const validSlug = (value: unknown) => cleanText(value, 60).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
export const validColor = (value: unknown, fallback: string) => /^#[0-9a-f]{6}$/i.test(String(value ?? "")) ? String(value) : fallback;
export const optionalHttpsUrl = (value: unknown): string | null => { const text = cleanText(value, 500); if (!text) return null; try { const url = new URL(text); return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null; } catch { return null; } };
export const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
