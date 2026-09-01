import { expect, test } from "bun:test";
import { chmod, mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { loadSavedConfig, saveConfig, type SavedConfig } from "../src/config-store";

const config: SavedConfig = {
  databaseUrl: "postgres://user:secret@example.com/db",
  projectRef: "project",
  accessToken: "sbp_secret",
  llmCommand: "pi-high.sh",
  withLogs: true,
  days: 7,
};

test("saves and loads an env config with restrictive permissions", async () => {
  const directory = await mkdtemp(join(process.cwd(), "config-test-"));
  try {
    const path = join(directory, "config.env");
    await saveConfig(path, config);
    expect(await loadSavedConfig(path)).toEqual(config);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("ignores comments and unknown config keys", async () => {
  const directory = await mkdtemp(join(process.cwd(), "config-test-"));
  try {
    const path = join(directory, "config.env");
    await Bun.write(path, '# saved\nDATABASE_URL="postgres://user:p%40ss@host/db"\nSUPABASE_PROJECT_REF=ref\nUNKNOWN=value\n');
    expect(await loadSavedConfig(path)).toMatchObject({ databaseUrl: "postgres://user:p%40ss@host/db", projectRef: "ref" });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
