import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { offerConfigCleanup } from "../src/config-cleanup";

test("offers to delete the saved credentials file", async () => {
  const directory = await mkdtemp(join(process.cwd(), "cleanup-test-"));
  const path = join(directory, "config.env");
  await Bun.write(path, "DATABASE_URL=secret\n");
  const messages: string[] = [];
  try {
    await offerConfigCleanup(path, async () => true, (message) => messages.push(message));
    expect(await Bun.file(path).exists()).toBe(false);
    expect(messages[0]).toContain("security risk");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("warns when the user keeps the file", async () => {
  const directory = await mkdtemp(join(process.cwd(), "cleanup-test-"));
  const path = join(directory, "config.env");
  await Bun.write(path, "DATABASE_URL=secret\n");
  const messages: string[] = [];
  try {
    await offerConfigCleanup(path, async () => false, (message) => messages.push(message));
    expect(await Bun.file(path).exists()).toBe(true);
    expect(messages.at(-1)).toContain("remains");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
