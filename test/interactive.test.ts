import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { resolveInteractiveConfig } from "../src/interactive";

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
