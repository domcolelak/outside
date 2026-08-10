import { renderToBuffer } from "@react-pdf/renderer";
import type { ScanResult } from "@/lib/types";
import { ReportDocument } from "@/components/report/ReportDocument";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { registerReportFonts } from "./fonts";

/** Render a ScanResult to a PDF buffer. Isolated so the route stays a .ts file. */
export async function renderReport(result: ScanResult, locale: Locale = DEFAULT_LOCALE): Promise<Buffer> {
  // Registration is idempotent and has to happen before the document is built,
  // because the stylesheet asks for the family by name.
  registerReportFonts();
  return renderToBuffer(<ReportDocument result={result} locale={locale} />);
}
