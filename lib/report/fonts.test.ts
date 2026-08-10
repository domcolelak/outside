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

  it("falls back to English rather than drawing a language it cannot spell", () => {
    if (canRenderLocalized()) {
      // The font is installed: every language may be rendered as asked.
      expect(reportLocale("pl")).toBe("pl");
      expect(reportLocale("hu")).toBe("hu");
    } else {
      // No font: a Polish report is written in English, not in broken Polish.
      expect(reportLocale("pl")).toBe("en");
      expect(reportLocale("cs")).toBe("en");
      expect(reportFontFamily()).toBe("Helvetica");
    }
  });

  it("asks for English identically either way", () => {
    expect(reportLocale("en")).toBe("en");
  });

  it("only claims localized rendering when the file is really there", () => {
    expect(canRenderLocalized()).toBe(existsSync(FONT) && missingGlyphs(readFileSync(FONT)).length === 0);
  });
});
