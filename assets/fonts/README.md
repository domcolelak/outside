# Report fonts

Generated PDFs need a font that can spell the languages OUTSIDE ships in.

The PDF base-14 fonts (Helvetica and friends) are WinAnsi-encoded: Latin-1 plus
a few extras. They do **not** contain

    ł ą ę ć ń ś ź ż    Polish
    ě ř ů č ď ť ň      Czech
    ľ ĺ ŕ              Slovak
    ő ű                Hungarian

(`š` and `ž` are fine — CP1252 has those two.)

Drawing a report in Helvetica therefore loses those characters with no error at
all. The reader sees holes in the words and cannot tell which ones went missing,
which is worse than an English report. So `lib/report/fonts.ts` **fails closed**:
until a sufficient font is present here, reports render in English.

## Adding the font

Download Noto Sans (SIL Open Font License 1.1) from
https://fonts.google.com/noto/specimen/Noto+Sans and place:

    assets/fonts/NotoSans-Regular.ttf
    assets/fonts/NotoSans-Bold.ttf     (optional; headings fall back to regular)
    assets/fonts/OFL.txt               the licence, shipped alongside the font

Any other font with the same coverage works. `registerReportFonts()` parses the
font's own character map and refuses a file that is missing even one required
character, so the check does not depend on the file name.

`lib/report/fonts.test.ts` asserts the fallback behaviour while the font is
absent, and the localized behaviour once it is present — no test edit needed.
