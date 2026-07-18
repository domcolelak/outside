import { describe, expect, it } from "vitest";
import { csvCell } from "@/lib/export/csv";

describe("csvCell", () => {
  it("quotes and escapes normal values", () => {
    expect(csvCell('Outside, "Guardian"')).toBe('"Outside, ""Guardian"""');
  });

  it.each(["=2+2", "+cmd", "-1+2", "@SUM(A1:A2)", "\t=1", "\r=1"])(
    "neutralizes spreadsheet formula prefix %j",
    (value) => {
      expect(csvCell(value)).toBe(`"'${value.replace(/"/g, '""')}"`);
    },
  );

  it("preserves null as an empty quoted cell", () => {
    expect(csvCell(null)).toBe('""');
  });
});
