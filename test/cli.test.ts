import { expect, test } from "bun:test";
import { main } from "../src/cli";

test("supports version, help, and offline self-test", async () => {
  expect(await main(["--version"])).toBe(0);
  expect(await main(["--help"])).toBe(0);
  expect(await main(["self-test"])).toBe(0);
});

test("rejects missing non-interactive database input", async () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  await expect(main(["collect", "--non-interactive"])).rejects.toThrow("DATABASE_URL");
  if (previous) process.env.DATABASE_URL = previous;
});

test("rejects no-redact in non-interactive mode", async () => {
  await expect(main(["report", "missing-evidence.json", "--non-interactive", "--no-redact"])).rejects.toThrow("rejected in non-interactive mode");
});

test("report does not require a database URL", async () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  await expect(main(["report", "missing-evidence.json", "--non-interactive"])).rejects.toThrow("LLM command");
  if (previous) process.env.DATABASE_URL = previous;
});
