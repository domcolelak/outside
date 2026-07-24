import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  getAuthStore: vi.fn(),
  googleConfigured: vi.fn(),
  verifyState: vi.fn(),
  exchangeGoogleCode: vi.fn(),
  enterpriseSsoRequirement: vi.fn(),
  signSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getAuthStore: h.getAuthStore,
}));
vi.mock("@/lib/auth/password", () => ({
  hashPassword: vi.fn(),
}));
vi.mock("@/lib/auth/oauth", () => ({
  exchangeGoogleCode: h.exchangeGoogleCode,
  googleConfigured: h.googleConfigured,
  OAUTH_STATE_COOKIE: "outside_oauth_state",
  verifyState: h.verifyState,
}));
vi.mock("@/lib/auth/session", () => ({
  SESSION_MAX_AGE: 2_592_000,
  sessionCookie: (token: string) => `outside_session=${token}; Path=/; HttpOnly`,
  signSession: h.signSession,
}));
vi.mock("@/lib/enterprise/login-policy", () => ({
  enterpriseSsoRequirement: h.enterpriseSsoRequirement,
}));

import { GET } from "@/app/api/auth/oauth/google/callback/route";

const user = {
  id: "user-1",
  email: "person@corp.test",
  name: "Person",
  passwordHash: "unused",
  emailVerifiedAt: "2026-07-23T00:00:00.000Z",
  sessionVersion: 0,
  createdAt: "2026-07-23T00:00:00.000Z",
};

function request(): NextRequest {
  return new NextRequest(
    "http://localhost/api/auth/oauth/google/callback?code=google-code&state=state",
    { headers: { cookie: "outside_oauth_state=state" } },
  );
}

beforeEach(() => {
  for (const mock of Object.values(h)) mock.mockReset();
  h.googleConfigured.mockReturnValue(true);
  h.verifyState.mockReturnValue(true);
  h.exchangeGoogleCode.mockResolvedValue({
    email: user.email,
    name: user.name,
    subject: "google-subject",
  });
  h.getAuthStore.mockResolvedValue({
    findUserByEmail: vi.fn().mockResolvedValue(user),
  });
});

describe("Google OAuth enterprise SSO policy", () => {
  it("redirects to enforced enterprise SSO without issuing an app session", async () => {
    h.enterpriseSsoRequirement.mockResolvedValue({
      providerId: "idp-1",
      workspaceId: "workspace-1",
      ssoUrl: "/api/enterprise/sso?email=person%40corp.test",
    });

    const response = await GET(request());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/api/enterprise/sso?email=person%40corp.test",
    );
    expect(h.signSession).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toContain(
      "outside_oauth_state=;",
    );
  });

  it("issues the normal session only when enterprise SSO is not enforced", async () => {
    h.enterpriseSsoRequirement.mockResolvedValue(null);
    h.signSession.mockReturnValue("signed-session");

    const response = await GET(request());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/account");
    expect(h.signSession).toHaveBeenCalledWith(
      user.id,
      2_592_000,
      user.sessionVersion,
    );
    expect(response.headers.get("set-cookie")).toContain(
      "outside_session=signed-session",
    );
  });
});
