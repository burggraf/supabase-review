import type { CliArgs } from "./args";
import { promptSecret, promptText } from "./prompts";

export interface ConfigPrompts {
  secret: (message: string) => Promise<string>;
  text: (message: string) => Promise<string>;
}

export interface ResolvedConfig {
  databaseUrl: string | undefined;
  projectRef?: string;
  accessToken?: string;
  llmCommand?: string;
  skipLlmValidation: boolean;
}

const defaultPrompts: ConfigPrompts = { secret: promptSecret, text: promptText };

export function inferProjectRef(databaseUrl: string): string | undefined {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return undefined;
  }
  const direct = /^db\.([^.]+)\.supabase\.co$/i.exec(url.hostname)?.[1];
  if (direct) return direct;
  const pooler = /^postgres\.([^.]+)$/i.exec(decodeURIComponent(url.username));
  return pooler?.[1];
}

function validateDatabaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URI");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") throw new Error("DATABASE_URL must use postgres: or postgresql:");
  return value;
}

export async function resolveConfig(args: CliArgs, env: Record<string, string | undefined> = process.env, prompts: ConfigPrompts = defaultPrompts): Promise<ResolvedConfig> {
  const databaseUrl = args.nonInteractive ? env.DATABASE_URL : env.DATABASE_URL ?? await prompts.secret("PostgreSQL connection URI:");
  if (!databaseUrl && args.command !== "report") throw new Error("DATABASE_URL is required; provide it in the environment or use interactive mode");
  if (databaseUrl) validateDatabaseUrl(databaseUrl);
  const projectRef = args.projectRef ?? env.SUPABASE_PROJECT_REF ?? (databaseUrl ? inferProjectRef(databaseUrl) : undefined);
  const accessToken = args.withLogs ? (args.nonInteractive ? env.SUPABASE_ACCESS_TOKEN : env.SUPABASE_ACCESS_TOKEN ?? await prompts.secret("Supabase access token (used only for Logs):")) : undefined;
  if (args.withLogs && !accessToken) throw new Error("SUPABASE_ACCESS_TOKEN is required when --with-logs is enabled");
  const llmCommand = args.llmCommand ?? env.SUPABASE_REVIEW_LLM_COMMAND ?? (args.command === "report" && !args.nonInteractive ? await prompts.text("LLM command (reads stdin, writes stdout):") : undefined);
  if (args.command === "report" && !llmCommand) throw new Error("An LLM command is required for report generation");
  return { databaseUrl, ...(projectRef ? { projectRef } : {}), ...(accessToken ? { accessToken } : {}), ...(llmCommand ? { llmCommand } : {}), skipLlmValidation: args.skipLlmValidation };
}
