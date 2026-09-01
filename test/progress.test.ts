import { expect, test } from "bun:test";
import { formatProgress } from "../src/progress";

test("formats actionable progress messages with wait estimates", () => {
  expect(formatProgress("database", "13 checks; usually under 3 minutes, up to about 4 minutes")).toBe("[1/5] Collecting database evidence — 13 checks; usually under 3 minutes, up to about 4 minutes.");
  expect(formatProgress("logs", "1-day windows; up to about 1 minute per window")).toContain("Collecting hosted logs");
  expect(formatProgress("validation", "up to 60 seconds")).toContain("Validating LLM command");
  expect(formatProgress("detailed", "up to 10 minutes")).toContain("Generating detailed report");
  expect(formatProgress("executive", "up to 10 minutes")).toContain("Generating executive summary");
});
