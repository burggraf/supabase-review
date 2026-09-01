import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { resolveInteractiveConfig, formatSettingsSummary } from "../src/interactive";

test("prompts for missing values and saves them only after consent", async () => {
  const directory = await mkdtemp(join(process.cwd(), "interactive-test-"));
  const answers = ["postgres://user:secret@db.project.supabase.co/db", "sbp_secret", "7", "pi-high.sh"];
  const prompts = { secret: async () => answers.shift()!, text: async () => answers.shift()!, confirm: async () => true };
  try {
    const result = await resolveInteractiveConfig({}, prompts, join(directory, "config.env"));
    expect(result.config.databaseUrl).toContain("postgres://");
    expect(result.withLogs).toBe(true);
    expect(result.config.llmCommand).toBe("pi-high.sh");
    expect(await Bun.file(join(directory, "config.env")).exists()).toBe(true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("summarizes exactly what the saved settings contain without exposing secrets", () => {
  const summary = formatSettingsSummary({ databaseUrl: "postgres://user:secret@db.example.com/postgres", projectRef: "project", accessToken: "sbp_secret", llmCommand: "pi-high.sh", withLogs: true, days: 7 });
  expect(summary).toContain("database host: db.example.com");
  expect(summary).toContain("\n  project ref:");
  expect(summary).not.toContain("\\n");
  expect(summary).toContain("project ref: project");
  expect(summary).toContain("hosted logs: yes");
  expect(summary).toContain("log lookback: 7 days");
  expect(summary).toContain("DATABASE_URL: saved (contains database password)");
  expect(summary).toContain("SUPABASE_ACCESS_TOKEN: saved");
  expect(summary).toContain("LLM command: pi-high.sh");
  expect(summary).not.toContain("secret");
});
