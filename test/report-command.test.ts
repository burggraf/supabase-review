import { expect, test } from "bun:test";
import { commandFingerprint, runLlmCommand, validateLlmCommand } from "../src/report/command";

test("sends prompt through stdin and returns stdout", async () => {
  const result = await runLlmCommand("cat", "hello", { env: { ...process.env, DATABASE_URL: "secret", SUPABASE_ACCESS_TOKEN: "token" } });
  expect(result.stdout).toBe("hello");
});

test("removes database credentials but preserves unrelated environment", async () => {
  const result = await runLlmCommand("env", "prompt", { env: { ...process.env, DATABASE_URL: "secret", SUPABASE_ACCESS_TOKEN: "token", TEST_AUTH_VALUE: "kept" } });
  expect(result.stdout).not.toContain("DATABASE_URL=");
  expect(result.stdout).not.toContain("SUPABASE_ACCESS_TOKEN=");
  expect(result.stdout).toContain("TEST_AUTH_VALUE=kept");
});

test("validates a fixture command and fingerprints without storing command text", async () => {
  expect(await validateLlmCommand("printf SUPABASE_REVIEW_READY")).toBe(true);
  expect(commandFingerprint("secret command")).toMatch(/^[a-f0-9]{64}$/);
});

test("reports non-zero and empty output failures", async () => {
  await expect(runLlmCommand("exit 7", "prompt")).rejects.toThrow("code 7");
  await expect(runLlmCommand("true", "prompt")).rejects.toThrow("empty stdout");
});
