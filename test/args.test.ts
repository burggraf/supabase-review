import { expect, test } from "bun:test";
import { parseCliArgs } from "../src/args";

test("defaults to run and seven days", () => {
  expect(parseCliArgs([])).toMatchObject({ command: "run", days: 7, skipLlmValidation: false });
});

test("parses all supported commands and options", () => {
  expect(parseCliArgs(["collect", "--output", "out", "--project-ref", "abc", "--days", "2", "--with-logs", "--non-interactive"])).toMatchObject({ command: "collect", output: "out", projectRef: "abc", days: 2, withLogs: true, nonInteractive: true });
  expect(parseCliArgs(["report", "evidence.json", "--with-llm", "--llm-command", "cat", "--skip-llm-validation", "--no-redact"])).toMatchObject({ command: "report", evidencePath: "evidence.json", withLlm: true, llmCommand: "cat", skipLlmValidation: true, noRedact: true });
  expect(parseCliArgs(["self-test", "--help"]).help).toBe(true);
});

test("rejects invalid days and secret flags", () => {
  expect(() => parseCliArgs(["--days", "0"])).toThrow();
  expect(() => parseCliArgs(["--days", "91"])).toThrow();
  expect(() => parseCliArgs(["--database-url", "postgres://secret"])).toThrow();
});
