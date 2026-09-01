import { mkdir, rename } from "node:fs/promises";
import { join } from "node:path";

export function normalizeJson(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, item]) => {
        const normalized = normalizeJson(item);
        return normalized === undefined ? [] : [[key, normalized]];
      }),
    );
  }
  return value;
}

function safeTimestamp(now: Date): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

export async function createRunDirectory(base: string, label: string, now: Date): Promise<string> {
  await mkdir(base, { recursive: true });
  const safeLabel = label.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "run";
  const path = join(base, `${safeLabel}-${safeTimestamp(now)}`);
  await mkdir(path);
  return path;
}

async function writeAtomic(path: string, content: string): Promise<void> {
  const temporary = `${path}.tmp`;
  await Bun.write(temporary, content);
  await rename(temporary, path);
}

export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await writeAtomic(path, `${JSON.stringify(normalizeJson(value), null, 2)}\n`);
}

export async function writeTextAtomic(path: string, value: string): Promise<void> {
  await writeAtomic(path, value);
}
