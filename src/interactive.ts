import { inferProjectRef, type ResolvedConfig } from "./config";
import { promptConfirm, promptSecret, promptText } from "./prompts";
import { defaultConfigPath, loadSavedConfig, saveConfig, type SavedConfig } from "./config-store";

export interface InteractivePrompts {
  secret: (message: string) => Promise<string>;
  text: (message: string) => Promise<string>;
  confirm: (message: string) => Promise<boolean>;
}

const defaults: InteractivePrompts = { secret: promptSecret, text: promptText, confirm: promptConfirm };

export function formatSettingsSummary(config: SavedConfig): string {
  let host = "unknown";
  try { host = config.databaseUrl ? new URL(config.databaseUrl).hostname : host; } catch { /* keep host masked */ }
  return [
    "Settings to save:",
    `  database host: ${host}`,
    `  project ref: ${config.projectRef ?? "not set"}`,
    `  hosted logs: ${config.withLogs ? "yes" : "no"}`,
    `  log lookback: ${config.days ?? 7} days`,
    `  Supabase access token: ${config.accessToken ? "provided" : "not set"}`,
    `  LLM command: ${config.llmCommand ?? "not set"}`,
  ].join("\\n");
}

export async function resolveInteractiveConfig(env: Record<string, string | undefined> = process.env, prompts: InteractivePrompts = defaults, path = defaultConfigPath()): Promise<{ config: ResolvedConfig; withLogs: boolean; days: number }> {
  const saved = await loadSavedConfig(path);
  if (Object.keys(saved).length) console.log(`Loaded previously saved settings from ${path}.`);
  const databaseUrl = env.DATABASE_URL ?? saved.databaseUrl ?? await prompts.secret("PostgreSQL connection URI:");
  const projectRef = env.SUPABASE_PROJECT_REF ?? saved.projectRef ?? inferProjectRef(databaseUrl);
  const withLogs = env.SUPABASE_REVIEW_WITH_LOGS ? env.SUPABASE_REVIEW_WITH_LOGS === "true" : saved.withLogs ?? await prompts.confirm("Collect Supabase hosted logs? (may incur usage charges)");
  const accessToken = withLogs ? env.SUPABASE_ACCESS_TOKEN ?? saved.accessToken ?? await prompts.secret("Supabase access token:") : undefined;
  const daysValue = env.SUPABASE_REVIEW_DAYS ?? saved.days ?? await prompts.text("Log lookback days:");
  const days = Number(daysValue || 7);
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error("Log lookback must be an integer from 1 to 90");
  const llmCommand = env.SUPABASE_REVIEW_LLM_COMMAND ?? saved.llmCommand ?? await prompts.text("LLM command (reads stdin, writes stdout):");
  if (!llmCommand) throw new Error("An LLM command is required");
  const next: SavedConfig = { databaseUrl, ...(projectRef ? { projectRef } : {}), ...(accessToken ? { accessToken } : {}), llmCommand, withLogs, days };
  console.log(formatSettingsSummary(next));
  if (await prompts.confirm("Save or update these settings for future runs?")) await saveConfig(path, next);
  return { config: { databaseUrl, ...(projectRef ? { projectRef } : {}), ...(accessToken ? { accessToken } : {}), llmCommand, skipLlmValidation: false }, withLogs, days };
}
