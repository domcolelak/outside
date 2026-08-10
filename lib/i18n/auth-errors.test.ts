import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { LOCALES } from "./locales";
import { getTranslator } from "./messages";
import enAuth from "@/messages/en/auth.json";

/**
 * Every failure code the auth routes can return must have a message.
 *
 * The routes answer with a stable `code` and an English `error` string; the UI
 * translates the code. A code added on the server without a catalog entry would
 * silently fall back to English — a Slovak user would get a fully translated
 * form and an English rejection, which is exactly the failure this whole layer
 * exists to prevent. So the codes are read out of the route source itself
 * rather than from a list someone has to remember to update.
 */
const ROUTES = [
  "app/api/auth/login/route.ts",
  "app/api/auth/signup/route.ts",
  "app/api/auth/password-reset/confirm/route.ts",
];

function codesInSource(): string[] {
  const codes = new Set<string>();
  for (const route of ROUTES) {
    const source = readFileSync(join(process.cwd(), route), "utf8");
    for (const match of source.matchAll(/\bcode:\s*"([a-z_]+)"/g)) codes.add(match[1]!);
  }
  // The password rules live in the auth library, not in the route that reports
  // them, so the codes it can produce are read from there too.
  const password = readFileSync(join(process.cwd(), "lib/auth/password.ts"), "utf8");
  for (const match of password.matchAll(/\bcode:\s*"([a-z_]+)"/g)) codes.add(match[1]!);
  return [...codes].sort();
}

/** login/page.tsx maps codes to catalog keys; read that map from its source. */
function mappedCodes(): Record<string, string> {
  const source = readFileSync(join(process.cwd(), "app/login/page.tsx"), "utf8");
  const block = source.match(/const ERROR_KEYS[^=]*=\s*\{([^}]*)\}/s)?.[1] ?? "";
  return Object.fromEntries([...block.matchAll(/(\w+):\s*"(\w+)"/g)].map((m) => [m[1]!, m[2]!]));
}

describe("auth failure messages", () => {
  it("maps every code the auth routes emit to a catalog key", () => {
    const mapped = mappedCodes();
    for (const code of codesInSource()) {
      expect(mapped[code], `no message key for the "${code}" failure code`).toBeDefined();
    }
  });

  it("resolves every mapped key in every language", () => {
    for (const key of Object.values(mappedCodes())) {
      expect(Object.keys(enAuth), `"${key}" is not an English auth key`).toContain(key);
      for (const { code } of LOCALES) {
        const rendered = getTranslator(code).t("auth", key as never);
        expect(rendered, `${code}/auth.${key} is unresolved`).not.toBe(key);
      }
    }
  });

  it("keeps the two rejection reasons indistinguishable in every language", () => {
    // A wrong password and an unknown account must read identically, or the
    // translation reintroduces the user enumeration the English copy avoids.
    for (const { code } of LOCALES) {
      const t = getTranslator(code);
      expect(t.t("auth", "errorInvalidCredentials")).toBeTruthy();
      expect(t.t("auth", "errorInvalidCredentials")).not.toContain("{");
    }
  });
});
