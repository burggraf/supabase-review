import type { ParsedSlowQuery } from "../types";

const SCAN_TYPES = ["Seq Scan", "Index Scan", "Parallel Seq Scan", "Parallel Index Scan", "Bitmap Heap Scan", "Bitmap Index Scan", "Tid Scan", "Subquery Scan", "Function Scan", "Merge Join", "Hash Join", "Nested Loop", "Merge Append", "Materialize"];
const MAX_GROUPS = 2_000;

function timestamp(value: unknown): string | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN;
  if (Number.isFinite(number)) return new Date(number < 1e12 ? number * 1000 : number > 1e14 ? number / 1000 : number).toISOString();
  if (typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return undefined;
}

export function parseSlowLogs(rows: unknown[]): { slowQueries: ParsedSlowQuery[]; warnings: string[]; truncated: boolean } {
  const groups = new Map<string, ParsedSlowQuery>();
  const warnings: string[] = [];
  let unparsed = 0;
  let truncated = false;
  for (const row of rows) {
    const record = row as { timestamp?: unknown; event_message?: unknown };
    const message = typeof record.event_message === "string" ? record.event_message : "";
    const seen = timestamp(record.timestamp);
    const durationMatch = /duration:\s*([\d.]+)\s*ms/i.exec(message);
    const duration = durationMatch ? Number(durationMatch[1]) : undefined;
    const planAt = message.search(/^\s*\(cost=[\d.]+\.\.[\d.]+/im);
    const header = /duration:\s*[\d.]+\s*ms\s*Query Text:\s*/i.exec(message);
    const queryText = header ? message.slice(header.index + header[0].length, planAt >= 0 ? planAt : undefined).trim() : undefined;
    const plan = planAt >= 0 ? message.slice(planAt).trim() : undefined;
    const query = queryText ? queryText.replace(/\s+/g, " ").trim() : undefined;
    if (!seen || duration === undefined || !query) {
      unparsed++;
      if (!seen || duration === undefined || (!query && !plan)) continue;
    }
    const key = query ?? `[unparsed:${unparsed}]`;
    const scans = SCAN_TYPES.filter((name) => (plan ?? message).includes(name));
    const status: ParsedSlowQuery["parse_status"] = seen && duration !== undefined && query ? "parsed" : "partial";
    const current = groups.get(key);
    if (!current) {
      if (groups.size >= MAX_GROUPS) { truncated = true; continue; }
      groups.set(key, {
        first_seen: seen ?? "unknown",
        last_seen: seen ?? "unknown",
        occurrences: 1,
        ...(duration !== undefined ? { min_duration_ms: duration, max_duration_ms: duration } : {}),
        ...(query ? { query } : {}),
        ...(plan ? { plan } : {}),
        scan_types: scans,
        parse_status: status,
      });
      continue;
    }
    current.occurrences++;
    if (seen && (current.first_seen === "unknown" || seen < current.first_seen)) current.first_seen = seen;
    if (seen && (current.last_seen === "unknown" || seen > current.last_seen)) current.last_seen = seen;
    if (duration !== undefined) {
      current.min_duration_ms = Math.min(current.min_duration_ms ?? duration, duration);
      current.max_duration_ms = Math.max(current.max_duration_ms ?? duration, duration);
    }
    for (const scan of scans) if (!current.scan_types.includes(scan)) current.scan_types.push(scan);
    if (status === "parsed") current.parse_status = "parsed";
  }
  if (unparsed) warnings.push(`${unparsed} slow-log event(s) were incomplete or unparseable; retained data may be partial.`);
  if (truncated) warnings.push(`Slow-log groups were capped at ${MAX_GROUPS}.`);
  return { slowQueries: [...groups.values()], warnings, truncated };
}
