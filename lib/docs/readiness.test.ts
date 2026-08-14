import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The readiness document states how much of the product is covered by tests.
 * It said "159 tests across 38 files" for long enough that the real figure had
 * grown past five times that — a claim nobody re-reads, in the one document
 * written to be shown to someone deciding whether to trust the thing.
 *
 * Prose cannot update itself, so the number is asserted instead. The file count
 * is used because it is exactly countable from here; a test count is not,
 * since a parameterised test is one call site and many cases.
 */
const DOC = join(process.cwd(), "docs", "PRODUCTION_READINESS.md");

function countTestFiles(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) total += countTestFiles(join(dir, entry.name));
    else if (entry.name.endsWith(".test.ts")) total += 1;
  }
  return total;
}

describe("the readiness document's coverage claim", () => {
  it("states the number of test files the repository actually has", () => {
    const doc = readFileSync(DOC, "utf8");
    const claimed = doc.match(/`(\d+)` tests across `(\d+)` files/);
    expect(claimed, "the coverage row is missing or reworded").toBeTruthy();

    const actual = countTestFiles(join(process.cwd(), "lib"));
    expect(
      Number(claimed![2]),
      `the document claims ${claimed![2]} test files; there are ${actual}. Update docs/PRODUCTION_READINESS.md.`,
    ).toBe(actual);
  });

  it("claims more tests than files, which any real suite does", () => {
    // A weak check on the number that cannot be counted from here — but it
    // catches the two ways it goes wrong: left at an old value while the file
    // count moves, or swapped with it.
    const doc = readFileSync(DOC, "utf8");
    const claimed = doc.match(/`(\d+)` tests across `(\d+)` files/)!;
    expect(Number(claimed[1])).toBeGreaterThan(Number(claimed[2]));
  });
});
