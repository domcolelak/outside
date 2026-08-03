import { describe, expect, it } from "vitest";
import { canonicalScanTarget } from "./scan-target";

describe("canonical scan target budgets", () => {
  it("maps URL, credential, port and trailing-dot aliases to one target bucket", () => {
    const aliases = [
      "victim.com",
      "https://victim.com/path",
      "user@victim.com",
      "victim.com:443",
      "victim.com.",
      "  VICTIM.COM  ",
    ];
    const targets = aliases.map((alias) => canonicalScanTarget(alias));
    expect(new Set(targets.map((item) => item.target))).toEqual(new Set(["victim.com"]));
    expect(new Set(targets.map((item) => item.budgetKey))).toHaveLength(1);
  });

  it("uses one bucket for a demo slug and its canonical demo domain", () => {
    const fromSlug = canonicalScanTarget("northstar", "northstarlabs.example");
    const fromDomain = canonicalScanTarget("northstarlabs.example", "northstarlabs.example");
    expect(fromSlug).toEqual(fromDomain);
  });
});
