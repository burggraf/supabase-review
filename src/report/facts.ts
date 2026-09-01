import type { CheckResult, Evidence } from "../types";

function cell(value: unknown): string {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ").replaceAll("\r", " ");
}

function renderCheck(check: CheckResult): string {
  const lines = [`### ${check.title} (${check.id})`, `Status: **${check.status}**`, `Duration: ${check.duration_ms} ms`, `Rows: ${check.row_count}`];
  if (check.truncated) lines.push("Warning: rows were truncated at the retention limit.");
  if (check.error) lines.push(`Error: ${cell(check.error.message)}${check.error.hint ? ` (${cell(check.error.hint)})` : ""}`);
  if (check.rows.length) {
    const keys = [...new Set(check.rows.flatMap((row) => Object.keys(row)))];
    lines.push("", `| ${keys.map(cell).join(" | ")} |`, `| ${keys.map(() => "---").join(" | ")} |`);
    for (const row of check.rows) lines.push(`| ${keys.map((key) => cell(row[key])).join(" | ")} |`);
  } else {
    lines.push("No rows observed.");
  }
  return lines.join("\n");
}

export function renderFacts(evidence: Evidence): string {
  const lines = [
    "# Supabase Performance Review: Observed Facts",
    "",
    `- Run: ${cell(evidence.run.id)}`,
    `- Tool version: ${cell(evidence.run.tool_version)}`,
    `- Database: ${cell(evidence.database.name) || "unknown"}`,
    `- Server version: ${cell(evidence.database.server_version) || "unknown"}`,
    `- Started: ${cell(evidence.run.started_at)}`,
    `- Completed: ${cell(evidence.run.completed_at)}`,
    "",
    "> This document contains observed facts, not remediation advice.",
    "",
    "## Database checks",
    "",
    ...evidence.database.checks.flatMap((check) => [renderCheck(check), ""]),
    "## Logs",
    "",
    `Status: **${evidence.logs.status}**`,
    `Requested days: ${evidence.logs.requested_days}`,
    `Windows queried: ${evidence.logs.windows_queried}`,
    `Rows received: ${evidence.logs.rows_received}`,
    ...(evidence.logs.truncated ? ["Warning: log rows were truncated."] : []),
    ...(evidence.logs.error ? [`Error: ${cell(evidence.logs.error.message)}`] : []),
    "",
    "## Warnings",
    "",
    ...(evidence.warnings.length ? evidence.warnings.map((warning) => `- ${cell(warning)}`) : ["None."]),
    "",
  ];
  return lines.join("\n");
}
