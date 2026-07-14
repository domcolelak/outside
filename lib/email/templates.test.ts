import { describe, expect, it } from "vitest";
import { escapeHtml, inviteEmail } from "./templates";

describe("email templates", () => {
  it("escapes attacker-controlled markup and attributes", () => {
    expect(escapeHtml(`<img src=x onerror="alert(1)">`)).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    const message = inviteEmail("person@example.com", `<script>alert(1)</script>`, `admin\" onclick=\"x`, `https://outside.test/invite/x\" onmouseover=\"x`);
    expect(message.html).not.toContain("<script>");
    expect(message.html).not.toContain('onclick="x');
    expect(message.html).not.toContain('onmouseover="x');
  });
});
