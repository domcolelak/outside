import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { canRenderLocalized, missingGlyphs, reportFontFamily, reportLocale, resetReportFontsForTest } from "./fonts";

/**
 * The PDF font question, held to an answer.
 *
 * The base-14 PDF fonts are WinAnsi-encoded and do not contain the characters
 * Polish, Czech, Slovak and Hungarian need. A report drawn in them loses those
 * characters without any error — the reader sees holes in the words and cannot
 * tell which ones went missing. So the rule is: render English, or render the
 * language correctly. Never render it wrongly.
 */
const FONT = join(process.cwd(), "assets", "fonts", "NotoSans-Regular.ttf");

/** The cmap subtable formats a font actually ships, read from its tables. */
function cmapFormats(font: Buffer): number[] {
  const tables = font.readUInt16BE(4);
  let cmap = 0;
  for (let i = 0; i < tables; i += 1) {
    const record = 12 + i * 16;
    if (font.toString("latin1", record, record + 4) === "cmap") cmap = font.readUInt32BE(record + 8);
  }
  if (!cmap) return [];
  const count = font.readUInt16BE(cmap + 2);
  const formats: number[] = [];
  for (let i = 0; i < count; i += 1) formats.push(font.readUInt16BE(cmap + font.readUInt32BE(cmap + 4 + i * 8 + 4)));
  return formats;
}

afterEach(() => resetReportFontsForTest());

describe("report fonts", () => {
  it("reads coverage out of the font file rather than trusting its name", () => {
    // Geist ships inside a dependency and is known to have full coverage; it is
    // used here only as a fixture with a real cmap to parse.
    const fixture = join(process.cwd(), "node_modules", "next", "dist", "compiled", "@vercel", "og", "Geist-Regular.ttf");
    if (!existsSync(fixture)) return;
    expect(missingGlyphs(readFileSync(fixture))).toEqual([]);
  });

  it("reports a font as unusable when it lacks the characters we need", () => {
    // A buffer with no cmap covers nothing, which is what an unusable font
    // looks like from here.
    expect(missingGlyphs(Buffer.alloc(64)).length).toBeGreaterThan(0);
  });

  it("finds the bundled font sufficient for all five languages", () => {
    // Asserted against the font itself, not against what the check concludes.
    // An earlier version of this test branched on canRenderLocalized() and so
    // passed happily while the cmap parser was reporting every character
    // missing — a test that agrees with the bug is worse than no test.
    expect(existsSync(FONT), "assets/fonts/NotoSans-Regular.ttf is missing").toBe(true);
    expect(missingGlyphs(readFileSync(FONT))).toEqual([]);
  });

  it("renders each language in the language that was asked for", () => {
    expect(canRenderLocalized()).toBe(true);
    for (const locale of ["en", "sk", "cs", "hu", "pl"] as const) {
      expect(reportLocale(locale)).toBe(locale);
    }
    expect(reportFontFamily()).toBe("OutsideReport");
    expect(reportFontFamily(true)).toBe("OutsideReport");
  });

  it("reads a format 12 character map, not only format 4", () => {
    // Noto Sans leads with a format 12 subtable. Reading only format 4 made the
    // font look like it covered nothing at all.
    const font = readFileSync(FONT);
    const formats = cmapFormats(font);
    expect(formats).toContain(12);
    expect(missingGlyphs(font)).toEqual([]);
  });
});
