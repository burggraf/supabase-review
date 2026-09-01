import { expect, test } from "bun:test";
import { renderOutputReadme } from "../src/report/output-readme";

test("explains every output file and its provenance", () => {
  const readme = renderOutputReadme({ reportGenerated: true, pdfMessage: "PDFs created with npx md-to-pdf." });
  for (const file of ["evidence.json", "facts.md", "report.md", "executive-summary.md", "analysis.json", "report.pdf", "executive-summary.pdf"]) expect(readme).toContain(file);
  expect(readme).toContain("observed database evidence");
  expect(readme).toContain("LLM command");
  expect(readme).toContain("npx md-to-pdf");
});

test("explains when PDFs were unavailable", () => {
  expect(renderOutputReadme({ reportGenerated: false, pdfMessage: "npx was not found; PDFs were not created." })).toContain("npx was not found");
});
