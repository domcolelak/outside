import { renderToBuffer } from "@react-pdf/renderer";
import type { ScanResult } from "@/lib/types";
import { ReportDocument } from "@/components/report/ReportDocument";

/** Render a ScanResult to a PDF buffer. Isolated so the route stays a .ts file. */
export async function renderReport(result: ScanResult): Promise<Buffer> {
  return renderToBuffer(<ReportDocument result={result} />);
}
