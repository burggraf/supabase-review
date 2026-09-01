import { expect, test } from "bun:test";
import { inferProjectRef, resolveConfig } from "../src/config";
import { parseCliArgs } from "../src/args";

const url = "postgresql://user:p%40ss@db.project123.supabase.co:5432/postgres";

test("infers project ref from direct and pooler URLs", () => {
  expect(inferProjectRef(url)).toBe("project123");
  expect(inferProjectRef("postgres://postgres.project456:p%40ss@pooler.supabase.com:5432/postgres")).toBe("project456");
  expect(inferProjectRef("postgres://user:p%40ss@example.com/postgres")).toBeUndefined();
});

test("resolves option before environment and prompts", async () => {
  const args = parseCliArgs(["report", "evidence.json", "--llm-command", "option"]);
  const result = await resolveConfig(args, { DATABASE_URL: url, SUPABASE_REVIEW_LLM_COMMAND: "env" });
  expect(result.llmCommand).toBe("option");
  expect(result.skipLlmValidation).toBe(false);
});

test("uses masked prompt adapters for missing interactive secrets", async () => {
  const args = parseCliArgs(["collect", "--with-logs"]);
  const result = await resolveConfig(args, {}, { secret: async () => "postgres://user@db.project.supabase.co/postgres", text: async () => "unused" });
  expect(result.accessToken).toBe("postgres://user@db.project.supabase.co/postgres");
});

test("fails clearly in non-interactive mode when required values are absent", async () => {
  await expect(resolveConfig(parseCliArgs(["collect", "--non-interactive"]), {})).rejects.toThrow("DATABASE_URL");
  await expect(resolveConfig(parseCliArgs(["report", "evidence.json", "--non-interactive"]), { DATABASE_URL: url })).rejects.toThrow("LLM command");
});
