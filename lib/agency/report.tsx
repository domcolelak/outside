import { renderToBuffer } from "@react-pdf/renderer";
import { AgencyReportDocument } from "@/components/report/AgencyReportDocument";
import type { AgencyReport } from "./types";
export async function renderAgencyReport(report: AgencyReport): Promise<Buffer> { return renderToBuffer(<AgencyReportDocument report={report} />); }
