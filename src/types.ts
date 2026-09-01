export type CheckStatus = "ok" | "error";
export type OptionalStatus = "ok" | "skipped" | "error";

export interface CheckResult {
  id: string;
  title: string;
  status: CheckStatus;
  duration_ms: number;
  row_count: number;
  truncated: boolean;
  rows: Record<string, unknown>[];
  error?: { code?: string; message: string; hint?: string };
}

export interface ParsedSlowQuery {
  first_seen: string;
  last_seen: string;
  occurrences: number;
  min_duration_ms?: number;
  max_duration_ms?: number;
  query?: string;
  plan?: string;
  scan_types: string[];
  parse_status: "parsed" | "partial" | "unparsed";
}

export interface Evidence {
  schema_version: 1;
  run: {
    id: string;
    tool_version: string;
    started_at: string;
    completed_at: string;
    platform: string;
    architecture: string;
  };
  database: {
    name?: string;
    server_version?: string;
    project_ref?: string;
    checks: CheckResult[];
  };
  logs: {
    status: OptionalStatus;
    requested_days: number;
    start?: string;
    end?: string;
    windows_queried: number;
    rows_received: number;
    truncated: boolean;
    slow_queries: ParsedSlowQuery[];
    error?: { message: string; status?: number };
  };
  warnings: string[];
}

export interface AnalysisOutput {
  schema_version: 1;
  provider: "external-cli";
  command_sha256: string;
  command_validated: boolean;
  generated_at: string;
  redaction_enabled: boolean;
  detailed_markdown: string;
  executive_markdown: string;
}
