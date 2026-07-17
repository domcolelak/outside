import { renderToBuffer } from "@react-pdf/renderer";
import { EnterpriseReportDocument } from "@/components/report/EnterpriseReportDocument";
import type { EnterpriseReportData } from "./reporting";
export async function renderEnterpriseReport(report: EnterpriseReportData): Promise<Buffer> { return renderToBuffer(<EnterpriseReportDocument report={report} />); }
