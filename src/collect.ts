import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { collectDatabase, type DatabaseCollection } from "./db/client";
import { collectLogs } from "./logs/client";
import { parseSlowLogs } from "./logs/parse";
import { renderFacts } from "./report/facts";
import { createRunDirectory, writeJsonAtomic, writeTextAtomic } from "./io";
import type { CliArgs } from "./args";
import type { Evidence } from "./types";
import { progress } from "./progress";
import { renderOutputReadme } from "./report/output-readme";

export interface CollectionDependencies {
  database: (url: string) => Promise<DatabaseCollection>;
  logs: typeof collectLogs;
  now: () => Date;
}

const defaults: CollectionDependencies = { database: collectDatabase, logs: collectLogs, now: () => new Date() };

export async function collectEvidence(args: CliArgs, config: { databaseUrl: string; projectRef?: string; accessToken?: string }, dependencies: Partial<CollectionDependencies> = {}) {
  const deps = { ...defaults, ...dependencies };
  const started = deps.now();
  progress("database", "13 checks; usually under 3 minutes, up to about 4 minutes");
  const database = await deps.database(config.databaseUrl);
  const warnings: string[] = [];
  const logs: Evidence["logs"] = { status: "skipped", requested_days: args.days, windows_queried: 0, rows_received: 0, truncated: false, slow_queries: [] };
  if (args.withLogs) {
    progress("logs", `${args.days}-day windows; up to about 1 minute per window`);
    if (!config.projectRef || !config.accessToken) {
      logs.status = "error";
      logs.error = { message: "Project ref and Supabase access token are required for logs" };
      warnings.push(logs.error.message);
    } else {
      try {
        const fetched = await deps.logs(config.projectRef, config.accessToken, args.days, undefined, undefined, started);
        const parsed = parseSlowLogs(fetched.rows);
        logs.status = "ok";
        logs.start = fetched.start;
        logs.end = fetched.end;
        logs.windows_queried = fetched.windowsQueried;
        logs.rows_received = fetched.rows.length;
        logs.truncated = fetched.truncated || parsed.truncated;
        logs.slow_queries = parsed.slowQueries;
        warnings.push(...parsed.warnings);
      } catch (error) {
        logs.status = "error";
        logs.error = { message: error instanceof Error ? error.message : "Logs collection failed" };
        warnings.push(`Logs collection warning: ${logs.error.message}`);
      }
    }
  }
  const completed = deps.now();
  const evidence: Evidence = {
    schema_version: 1,
    run: { id: randomUUID(), tool_version: "0.1.0", started_at: started.toISOString(), completed_at: completed.toISOString(), platform: process.platform, architecture: process.arch },
    database: { ...(database.databaseName ? { name: database.databaseName } : {}), ...(database.serverVersion ? { server_version: database.serverVersion } : {}), ...(config.projectRef ? { project_ref: config.projectRef } : {}), checks: database.checks },
    logs,
    warnings,
  };
  const base = args.output;
  const outputDir = base ? (await mkdir(base, { recursive: false }).then(() => base)) : await createRunDirectory(process.cwd(), "supabase-review", started);
  await writeJsonAtomic(join(outputDir, "evidence.json"), evidence);
  await writeTextAtomic(join(outputDir, "facts.md"), renderFacts(evidence));
  await writeTextAtomic(join(outputDir, "README.md"), renderOutputReadme({ reportGenerated: false, pdfMessage: "PDFs will be created if you later generate reports and npx md-to-pdf is available." }));
  return { evidence, outputDir, exitCode: database.allFailed ? 2 : 0 };
}
