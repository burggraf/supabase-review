import type { Evidence } from "../types";
import { redact } from "../redact";

export const REDACTION_WARNING = "Heuristic redaction was applied but is not guaranteed to remove all sensitive or personal data.";
const ROW_LIMIT = 200;

export function buildReportPayload(evidence: Evidence, redactionEnabled = true): Record<string, unknown> {
  const checks = evidence.database.checks.map((check) => ({
    ...check,
    rows: check.rows.slice(0, ROW_LIMIT),
    omitted_rows: Math.max(0, check.rows.length - ROW_LIMIT),
  }));
  const slowQueries = evidence.logs.slow_queries.slice(0, ROW_LIMIT);
  const payload: Record<string, unknown> = {
    schema_version: evidence.schema_version,
    database: { ...evidence.database, checks },
    logs: { ...evidence.logs, slow_queries: slowQueries, omitted_slow_queries: Math.max(0, evidence.logs.slow_queries.length - ROW_LIMIT) },
    warnings: evidence.warnings,
    ...(redactionEnabled ? { redaction_warning: REDACTION_WARNING } : {}),
  };
  return (redactionEnabled ? redact(payload) : payload) as Record<string, unknown>;
}
