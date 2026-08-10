/**
 * Font registration for generated PDFs.
 *
 * The PDF base-14 fonts (Helvetica and friends) are encoded WinAnsi, which is
 * Latin-1 plus a handful of extras. It does not contain ł ą ę ć ń ś ź ż, ě ř ů
 * č ď ť ň, ľ ĺ ŕ, ő or ű — so a Polish, Czech, Slovak or Hungarian report drawn
 * in Helvetica loses characters silently. Verified by rendering a probe PDF and
 * reading back `BaseFont /Helvetica` with `WinAnsiEncoding`.
 *
 * A report with holes in the words is worse than an English one: it looks like
 * corruption, and a customer cannot tell which characters were dropped. So this
 * fails closed. Until a font with the coverage is present, reports render in
 * English; they do not render mangled.
 *
 * To enable localized reports, drop a TrueType font with Latin Extended-A
 * coverage at assets/fonts/, together with its licence:
 *
 *   assets/fonts/NotoSans-Regular.ttf
 *   assets/fonts/NotoSans-Bold.ttf
 *   assets/fonts/OFL.txt
 *
 * Noto Sans is SIL OFL 1.1 and covers every character these five languages
 * need. Any other font with the same coverage works — reportFontFamily() checks
 * the glyphs rather than trusting the file name.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Font } from "@react-pdf/renderer";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";

const FONT_DIR = join(process.cwd(), "assets", "fonts");
const REGULAR = join(FONT_DIR, "NotoSans-Regular.ttf");
const BOLD = join(FONT_DIR, "NotoSans-Bold.ttf");

/** The family name used in stylesheets when the bundled font is available. */
export const REPORT_FONT = "OutsideReport";
/** The base-14 fallback: correct for English, wrong for everything else. */
export const FALLBACK_FONT = "Helvetica";

/**
 * Characters these five languages need that WinAnsi does not provide.
 * š and ž are deliberately absent — CP1252 does contain those two.
 */
const REQUIRED_GLYPHS = "łąęćńśźżěřůčďťňľĺŕőű";

/** Every character a TrueType cmap maps, read from the font itself. */
function coveredCodePoints(font: Buffer): Set<number> {
  const covered = new Set<number>();
  const tableCount = font.readUInt16BE(4);
  let cmapOffset = 0;
  for (let i = 0; i < tableCount; i += 1) {
    const record = 12 + i * 16;
    if (font.toString("latin1", record, record + 4) === "cmap") cmapOffset = font.readUInt32BE(record + 8);
  }
  if (!cmapOffset) return covered;

  // Read every Unicode subtable, not just one. Fonts commonly ship both a
  // format 4 BMP table and a format 12 full-range table; picking one and hoping
  // it is the readable format is how this silently reported total coverage
  // failure for Noto Sans, which leads with format 12.
  const subtables = font.readUInt16BE(cmapOffset + 2);
  for (let i = 0; i < subtables; i += 1) {
    const record = cmapOffset + 4 + i * 8;
    const platform = font.readUInt16BE(record);
    const encoding = font.readUInt16BE(record + 2);
    const isUnicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!isUnicode) continue;
    readSubtable(font, cmapOffset + font.readUInt32BE(record + 4), covered);
  }
  return covered;
}

/** Add one cmap subtable's code points. Unknown formats contribute nothing. */
function readSubtable(font: Buffer, offset: number, covered: Set<number>): void {
  if (offset <= 0 || offset + 4 > font.length) return;
  const format = font.readUInt16BE(offset);

  if (format === 4) {
    const segmentBytes = font.readUInt16BE(offset + 6);
    for (let segment = 0; segment < segmentBytes / 2; segment += 1) {
      const end = font.readUInt16BE(offset + 14 + segment * 2);
      const start = font.readUInt16BE(offset + 16 + segmentBytes + segment * 2);
      for (let code = start; code <= end && code !== 0xffff; code += 1) covered.add(code);
    }
    return;
  }

  if (format === 12) {
    const groups = font.readUInt32BE(offset + 12);
    for (let group = 0; group < groups; group += 1) {
      const record = offset + 16 + group * 12;
      if (record + 12 > font.length) return;
      const start = font.readUInt32BE(record);
      const end = font.readUInt32BE(record + 4);
      // Guard against a malformed group asking for millions of iterations.
      if (end < start || end - start > 0x10000) continue;
      for (let code = start; code <= end; code += 1) covered.add(code);
    }
  }
}

/** Which required characters a font is missing. Empty means it is usable. */
export function missingGlyphs(font: Buffer): string[] {
  const covered = coveredCodePoints(font);
  return [...REQUIRED_GLYPHS].filter((character) => !covered.has(character.codePointAt(0)!));
}

let registered: boolean | null = null;

/**
 * Register the bundled font, once, if it is present and actually sufficient.
 *
 * A font that is present but incomplete is rejected rather than used: silently
 * dropping four of a language's characters is the failure this exists to stop.
 */
export function registerReportFonts(): boolean {
  if (registered !== null) return registered;
  registered = false;
  try {
    if (!existsSync(REGULAR)) return registered;
    const missing = missingGlyphs(readFileSync(REGULAR));
    if (missing.length) {
      console.warn(`[report] ${REGULAR} is missing ${missing.join("")}; reports stay in English.`);
      return registered;
    }
    Font.register({
      family: REPORT_FONT,
      fonts: [
        { src: REGULAR, fontWeight: 400 },
        ...(existsSync(BOLD) ? [{ src: BOLD, fontWeight: 700 }] : []),
      ],
    });
    registered = true;
  } catch (error) {
    // A report that renders in English beats a report that fails to render.
    console.warn("[report] font registration failed; reports stay in English:", (error as Error).message);
  }
  return registered;
}

/** True when a report can be written in a language other than English. */
export function canRenderLocalized(): boolean {
  return registerReportFonts();
}

/**
 * The language a report should actually be written in.
 *
 * Falls back to English when no font can carry the requested language, so the
 * caller never has to remember to check.
 */
export function reportLocale(requested: Locale): Locale {
  if (requested === DEFAULT_LOCALE) return DEFAULT_LOCALE;
  return canRenderLocalized() ? requested : DEFAULT_LOCALE;
}

/** The font family to style a report with, given what is available. */
export function reportFontFamily(bold = false): string {
  if (canRenderLocalized()) return REPORT_FONT;
  return bold ? "Helvetica-Bold" : FALLBACK_FONT;
}

/** Test seam: forget what was detected so a test can vary the environment. */
export function resetReportFontsForTest(): void {
  registered = null;
}
