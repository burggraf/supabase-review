import { chmod, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface SavedConfig {
  databaseUrl?: string;
  projectRef?: string;
  accessToken?: string;
  llmCommand?: string;
  withLogs?: boolean;
  days?: number;
}

const keys: Record<string, keyof SavedConfig> = {
  DATABASE_URL: "databaseUrl",
  SUPABASE_PROJECT_REF: "projectRef",
  SUPABASE_ACCESS_TOKEN: "accessToken",
  SUPABASE_REVIEW_LLM_COMMAND: "llmCommand",
  SUPABASE_REVIEW_WITH_LOGS: "withLogs",
  SUPABASE_REVIEW_DAYS: "days",
};

export function defaultConfigPath(home = homedir()): string {
  return join(home, ".config", "supabase-review", "config.env");
}

function quote(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n")}"`;
}

export async function saveConfig(path: string, config: SavedConfig): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const entries: [string, unknown][] = [
    ["DATABASE_URL", config.databaseUrl], ["SUPABASE_PROJECT_REF", config.projectRef], ["SUPABASE_ACCESS_TOKEN", config.accessToken], ["SUPABASE_REVIEW_LLM_COMMAND", config.llmCommand], ["SUPABASE_REVIEW_WITH_LOGS", config.withLogs === undefined ? undefined : String(config.withLogs)], ["SUPABASE_REVIEW_DAYS", config.days],
  ];
  const content = `${entries.filter(([, value]) => value !== undefined).map(([key, value]) => `${key}=${quote(String(value))}`).join("\n")}\n`;
  await Bun.write(path, content);
  await chmod(path, 0o600);
}

export async function loadSavedConfig(path: string): Promise<SavedConfig> {
  const file = Bun.file(path);
  if (!(await file.exists())) return {};
  const result: SavedConfig = {};
  for (const line of (await file.text()).split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    const key = keys[match[1]!];
    if (!key) continue;
    let value = match[2]!;
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1).replaceAll("\\n", "\n").replaceAll('\\"', '"').replaceAll("\\\\", "\\");
    if (key === "days") result.days = Number(value);
    else if (key === "withLogs") result.withLogs = value === "true";
    else result[key] = value;
  }
  return result;
}
