import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthStore } from "@/lib/auth";
import { hashPassword } from "@/lib/auth/password";
import { SESSION_MAX_AGE, sessionCookie, signSession } from "@/lib/auth/session";
import { APP_URL } from "@/lib/config/runtime";
import { decryptEnterpriseSecret } from "@/lib/enterprise/crypto";
import { getEnterpriseStore } from "@/lib/enterprise/store";
import { ENTERPRISE_SSO_COOKIE, exchangeEnterpriseCode, verifySsoState, type OidcConfig } from "@/lib/enterprise/sso";
import type { EnterpriseDirectoryUser } from "@/lib/enterprise/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const failure = () => NextResponse.redirect(new URL("/login?error=sso_failed", APP_URL));

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const state = verifySsoState(req.cookies.get(ENTERPRISE_SSO_COOKIE)?.value, url.searchParams.get("state"));
  const code = url.searchParams.get("code");
  if (!state || !code) return failure();
  const store = await getEnterpriseStore();
  const provider = await store.identityProvider(state.idpId);
  if (!provider?.enabled) return failure();

  try {
    const profile = await exchangeEnterpriseCode(decryptEnterpriseSecret<OidcConfig>(provider.configEncrypted), code, state.nonce);
    const domain = profile.email.split("@")[1];
    if (!domain || !provider.domains.includes(domain)) return failure();
    const workspace = await store.workspace(provider.workspaceId);
    if (!workspace) return failure();

    const auth = await getAuthStore();
    const directory = await store.list<EnterpriseDirectoryUser>(workspace.id, "directoryUsers");
    let directoryUser = directory.find((item) => item.userName === profile.email && item.identityProviderId === provider.id);
    let user = await auth.findUserByEmail(profile.email);
    const needsProvisioning = !directoryUser || !user || !directoryUser.userId;
    if (needsProvisioning && !provider.jitProvisioning) return failure();
    const consumesNewSeat = !directoryUser || !directoryUser.active;
    if (needsProvisioning && consumesNewSeat && directory.filter((item) => item.active).length >= workspace.licensedSeats) return failure();

    if (needsProvisioning) {
      const passwordHash = await hashPassword(randomBytes(48).toString("base64url"));
      const provisioned = await auth.provisionMembership({ email: profile.email, name: profile.name, passwordHash, orgId: workspace.orgId, role: "viewer", provisionedBy: provider.id, active: true });
      user = provisioned.user;
      if (directoryUser) {
        directoryUser = await store.update<EnterpriseDirectoryUser>(workspace.id, "directoryUsers", directoryUser.id, { userId: user.id, displayName: profile.name, active: true, lastSyncedAt: new Date().toISOString() }) ?? directoryUser;
      } else {
        directoryUser = await store.create<EnterpriseDirectoryUser>(workspace.id, "directoryUsers", { identityProviderId: provider.id, userId: user.id, externalId: profile.subject, userName: profile.email, displayName: profile.name, active: true, departmentId: null, attributes: { oidcSubject: profile.subject }, lastSyncedAt: new Date().toISOString() });
      }
    }
    if (!user || !directoryUser?.active) return failure();
    const membership = await auth.getMembership(user.id, workspace.orgId);
    if (!membership?.active || membership.provisionedBy !== provider.id) return failure();

    await store.appendAudit({ workspaceId: workspace.id, actorType: "user", actorId: user.id, action: "enterprise.sso.login", resourceType: "identity_provider", resourceId: provider.id, requestId: req.headers.get("x-request-id"), ipHash: null, detail: { protocol: provider.protocol } });
    const response = NextResponse.redirect(new URL(state.returnTo, APP_URL));
    response.headers.append("Set-Cookie", sessionCookie(signSession(user.id, SESSION_MAX_AGE, user.sessionVersion)));
    response.headers.append("Set-Cookie", `${ENTERPRISE_SSO_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return response;
  } catch {
    return failure();
  }
}
