import type { CheckResult } from "../types";
import { QUERY_REGISTRY, type QueryDefinition } from "./registry";

export const MAX_ROWS = 5_000;

export type QueryExecutor = (query: QueryDefinition) => Promise<Record<string, unknown>[]>;

export interface DatabaseCollection {
  checks: CheckResult[];
  allFailed: boolean;
  databaseName?: string;
  serverVersion?: string;
}

export function sanitizeDatabaseError(error: unknown): { code?: string; message: string; hint?: string } {
  const source = error as { code?: unknown; message?: unknown; hint?: unknown };
  const message = typeof source?.message === "string" ? source.message : "Database check failed";
  return {
    ...(typeof source?.code === "string" ? { code: source.code } : {}),
    message: message.replace(/(?:postgres(?:ql)?:\/\/)[^\s]+/gi, "[redacted database URL]").slice(0, 500),
    ...(typeof source?.hint === "string" ? { hint: source.hint.slice(0, 300) } : {}),
  };
}

export async function collectChecks(executor: QueryExecutor, registry: readonly QueryDefinition[] = QUERY_REGISTRY): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];
  for (const query of registry) {
    const started = performance.now();
    try {
      const rows = await executor(query);
      checks.push({ id: query.id, title: query.title, status: "ok", duration_ms: Math.round(performance.now() - started), row_count: rows.length, truncated: rows.length > MAX_ROWS, rows: rows.slice(0, MAX_ROWS) });
    } catch (error) {
      checks.push({ id: query.id, title: query.title, status: "error", duration_ms: Math.round(performance.now() - started), row_count: 0, truncated: false, rows: [], error: sanitizeDatabaseError(error) });
    }
  }
  return checks;
}

export function databaseCollectionStatus(checks: CheckResult[]): Pick<DatabaseCollection, "allFailed"> {
  return { allFailed: checks.length > 0 && checks.every((check) => check.status === "error") };
}
