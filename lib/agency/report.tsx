import { renderToBuffer } from "@react-pdf/renderer";
import { AgencyReportDocument } from "@/components/report/AgencyReportDocument";
import type { AgencyReport } from "./types";
import type { Locale } from "@/lib/i18n/locales";
export async function renderAgencyReport(report: AgencyReport, locale: Locale): Promise<Buffer> { return renderToBuffer(<AgencyReportDocument report={report} locale={locale} />); }
