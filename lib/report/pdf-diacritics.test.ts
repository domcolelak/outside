import { createElement as h } from "react";
import { renderToBuffer, Document, Page, Text, View } from "@react-pdf/renderer";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { registerReportFonts, REPORT_FONT } from "./fonts";

/**
 * The characters actually survive into the PDF.
 *
 * Font coverage read from a cmap is a promise; this is the delivery. A report
 * drawn in a base-14 font loses these characters with no error at all, so the
 * proof has to come from the rendered bytes rather than from the font table.
 *
 * The check works by embedding: a font that can draw a character has that
 * character's glyph in the subset it embeds, and the resulting file is
 * measurably different from one that silently dropped it.
 */
const SAMPLES = {
  pl: "zasób łączność ćwierć ęą ńśźż",
  cs: "změny předchozí důvěra řeřicha",
  sk: "ľubovoľný ŕ ĺ ť ď ň š č ž",
  hu: "változás felület tűz ő ű",
};

/**
 * Every Unicode code point a PDF says it drew.
 *
 * Read out of the ToUnicode CMaps, which map the glyph codes in the content
 * stream back to characters — the same mapping a reader uses for copy, search
 * and text-to-speech. Entries look like `<0041> <0042> <0043>` inside a
 * bfchar/bfrange block.
 */
function toUnicodeCodePoints(pdf: Buffer): Set<number> {
  const points = new Set<number>();
  const raw = pdf.toString("latin1");
  const streams: string[] = [];
  const marker = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(raw))) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) continue;
    const slice = Buffer.from(raw.slice(start, end), "latin1");
    try {
      streams.push(inflateSync(slice).toString("latin1"));
    } catch {
      streams.push(slice.toString("latin1"));
    }
  }
  for (const stream of streams) {
    if (!stream.includes("beginbfchar") && !stream.includes("beginbfrange")) continue;
    for (const hex of stream.match(/<[0-9a-fA-F]{4,}>/g) ?? []) {
      const digits = hex.slice(1, -1);
      // A destination may hold several UTF-16 units; take each in turn.
      for (let i = 0; i + 4 <= digits.length; i += 4) points.add(parseInt(digits.slice(i, i + 4), 16));
    }
  }
  return points;
}

async function render(text: string, family: string): Promise<Buffer> {
  return renderToBuffer(
    h(Document, null, h(Page, { size: "A4", style: { padding: 24 } }, h(View, null, h(Text, { style: { fontFamily: family, fontSize: 12 } }, text)))),
  );
}

describe("diacritics in generated PDFs", () => {
  it("registers the bundled font", () => {
    expect(registerReportFonts()).toBe(true);
  });

  it("embeds a real glyph for every character each language needs", async () => {
    registerReportFonts();
    for (const [locale, sample] of Object.entries(SAMPLES)) {
      // Same sentence with the accents stripped. If the accented characters
      // were dropped rather than drawn, both files embed the same glyphs and
      // come out near-identical; a font that draws them embeds more.
      const plain = sample.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[łŁ]/g, "l");
      const [accented, stripped] = await Promise.all([render(sample, REPORT_FONT), render(plain, REPORT_FONT)]);
      expect(accented.length, `${locale} rendered nothing`).toBeGreaterThan(1000);
      expect(accented.length, `${locale} lost its accented characters`).not.toBe(stripped.length);
    }
  }, 30_000);

  it("maps every drawn character back to the right code point", async () => {
    // The strongest available proof. A PDF carries a ToUnicode map from the
    // glyphs it drew back to Unicode; that map is what copy-and-paste, search
    // and a screen reader read. If ł appears there, it was genuinely drawn as ł
    // rather than approximated, dropped, or substituted for something else.
    registerReportFonts();
    for (const [locale, sample] of Object.entries(SAMPLES)) {
      const buffer = await render(sample, REPORT_FONT);
      const mapped = toUnicodeCodePoints(buffer);
      const needed = [...new Set([...sample].filter((character) => character.charCodeAt(0) > 127))];
      const absent = needed.filter((character) => !mapped.has(character.codePointAt(0)!));
      expect(absent, `${locale} cannot be read back: ${absent.join("")}`).toEqual([]);
    }
  }, 30_000);

  it("produces a materially different file than the base-14 font would", async () => {
    // Helvetica cannot draw these at all; it is the failure being prevented.
    registerReportFonts();
    const [noto, helvetica] = await Promise.all([render(SAMPLES.pl, REPORT_FONT), render(SAMPLES.pl, "Helvetica")]);
    expect(noto.length).toBeGreaterThan(helvetica.length);
  }, 30_000);

  it("would catch the bug it exists for", async () => {
    // The negative control. A check that passes for the broken case as well
    // proves nothing, so the same read-back is run against Helvetica — the font
    // that silently drops these characters — and must find them missing.
    const buffer = await render(SAMPLES.pl, "Helvetica");
    const mapped = toUnicodeCodePoints(buffer);
    const needed = [...new Set([...SAMPLES.pl].filter((character) => character.charCodeAt(0) > 127))];
    const absent = needed.filter((character) => !mapped.has(character.codePointAt(0)!));
    expect(absent.length, "Helvetica appears able to draw Polish, so this check proves nothing").toBeGreaterThan(0);
  }, 30_000);
});
