const baseUrl = process.env.UMAMI_INTERNAL_URL || "http://analytics:3000";
const adminPassword = process.env.UMAMI_ADMIN_PASSWORD || "";
const previousPassword = process.env.UMAMI_ADMIN_PASSWORD_PREVIOUS || "";
const websiteId = process.env.UMAMI_WEBSITE_ID || "";
const domain = (process.env.UMAMI_SITE_DOMAIN || "").toLowerCase();

if (adminPassword.length < 16 || adminPassword === "umami") throw new Error("UMAMI_ADMIN_PASSWORD must be a non-default value of at least 16 characters");
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(websiteId)) throw new Error("UMAMI_WEBSITE_ID must be a UUID");
if (!domain || new URL(`https://${domain}`).hostname !== domain) throw new Error("UMAMI_SITE_DOMAIN must be a hostname");

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { accept: "application/json", "content-type": "application/json", ...(options.headers || {}) },
    signal: AbortSignal.timeout(15_000),
  });
}

async function login(password) {
  if (!password) return null;
  const response = await request("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "admin", password }) });
  if (!response.ok) return null;
  const body = await response.json();
  return typeof body.token === "string" ? body.token : null;
}

let authenticatedWith = adminPassword;
let token = await login(adminPassword);
if (!token && previousPassword) {
  authenticatedWith = previousPassword;
  token = await login(previousPassword);
}
if (!token) {
  authenticatedWith = "umami";
  token = await login("umami");
}
if (!token) throw new Error("Unable to authenticate the private Umami administrator");

const authorization = { authorization: `Bearer ${token}` };
const existing = await request(`/api/websites/${websiteId}`, { headers: authorization });
const existingWebsite = existing.ok ? await existing.json() : null;
if (existing.status === 404 || (existing.ok && existingWebsite === null)) {
  const created = await request("/api/websites", {
    method: "POST",
    headers: authorization,
    body: JSON.stringify({ id: websiteId, name: "OUTSIDE", domain }),
  });
  if (!created.ok) throw new Error(`Unable to create the OUTSIDE analytics site (${created.status})`);
} else if (!existing.ok) {
  throw new Error(`Unable to verify the OUTSIDE analytics site (${existing.status})`);
}

const verified = await request(`/api/websites/${websiteId}`, { headers: authorization });
const verifiedWebsite = verified.ok ? await verified.json() : null;
if (!verified.ok || verifiedWebsite?.id !== websiteId) {
  throw new Error(`Unable to verify the created OUTSIDE analytics site (${verified.status})`);
}

if (authenticatedWith !== adminPassword) {
  const changed = await request("/api/me/password", {
    method: "POST",
    headers: authorization,
    body: JSON.stringify({ currentPassword: authenticatedWith, newPassword: adminPassword }),
  });
  if (!changed.ok) throw new Error(`Unable to rotate the Umami administrator password (${changed.status})`);
}

console.log(JSON.stringify({ event: "analytics.bootstrap.complete", websiteId, domain }));
