import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * The translation review workflow, exercised against a throwaway catalog.
 *
 * The guarantee under test is the one that is easy to get wrong and impossible
 * to notice afterwards: when the English source changes, a translation a human
 * already reviewed must not be quietly kept as though it still matched, and must
 * not be overwritten either. It becomes stale and stays visible until reviewed.
 */
const SCRIPT = join(process.cwd(), "scripts", "translations.mjs");

let root: string;

function run(...args: string[]): string {
  return execFileSync(process.execPath, [SCRIPT, ...args], { env: { ...process.env, OUTSIDE_MESSAGES_DIR: root }, encoding: "utf8" });
}

const write = (path: string, value: unknown) => writeFileSync(join(root, path), JSON.stringify(value, null, 2), "utf8");
const read = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "outside-messages-"));
  mkdirSync(join(root, "en"));
  mkdirSync(join(root, "sk"));
  write("nontranslatable.json", { keys: ["common.productName"] });
  write("en/common.json", { greeting: "Hello", productName: "Guardian" });
  write("sk/common.json", { greeting: "Hello", productName: "Guardian" });
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("translation review workflow", () => {
  it("reports a copied English string as untranslated, but not a product name", () => {
    const output = run("report");
    expect(output).toMatch(/untranslated\s+common\.greeting/);
    expect(output).not.toContain("common.productName");
  });

  it("marks an imported translation reviewed against the source it was made from", () => {
    run("export", "sk", "--out", join(root, "work.json"));
    const work = read("work.json");
    work.entries = work.entries.map((entry: { id: string }) => ({ ...entry, translation: "Ahoj" }));
    write("work.json", work);

    run("import", join(root, "work.json"));
    expect(read("sk/common.json").greeting).toBe("Ahoj");
    expect(run("report")).not.toContain("common.greeting");
  });

  it("marks a reviewed translation stale when the English source changes, without touching it", () => {
    run("export", "sk", "--out", join(root, "work.json"));
    const work = read("work.json");
    work.entries = work.entries.map((entry: { id: string }) => ({ ...entry, translation: "Ahoj" }));
    write("work.json", work);
    run("import", join(root, "work.json"));

    write("en/common.json", { greeting: "Hello there", productName: "Guardian" });

    const output = run("report");
    expect(output).toMatch(/stale\s+common\.greeting/);
    // The human's work is still there — stale means "needs another look",
    // never "discard and fall back to English".
    expect(read("sk/common.json").greeting).toBe("Ahoj");
  });

  it("refuses an import made from copy that has changed since it was exported", () => {
    run("export", "sk", "--out", join(root, "work.json"));
    const work = read("work.json");
    work.entries = work.entries.map((entry: { id: string }) => ({ ...entry, translation: "Ahoj" }));
    write("work.json", work);

    write("en/common.json", { greeting: "Hello there", productName: "Guardian" });

    expect(() => run("import", join(root, "work.json"))).toThrow(/English changed since export/);
    // Nothing was applied, so a translation of the old sentence cannot be
    // recorded as a review of the new one.
    expect(read("sk/common.json").greeting).toBe("Hello");
  });
});
