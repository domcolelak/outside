import { renderToBuffer } from "@react-pdf/renderer";
import { EnterpriseReportDocument } from "@/components/report/EnterpriseReportDocument";
import type { EnterpriseReportData } from "./reporting";
import type { Locale } from "@/lib/i18n/locales";
export async function renderEnterpriseReport(report: EnterpriseReportData, locale: Locale): Promise<Buffer> { return renderToBuffer(<EnterpriseReportDocument report={report} locale={locale} />); }
