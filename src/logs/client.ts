import { SLOW_LOG_QUERY } from "./query";
import { createLogWindows, type LogWindow } from "./windows";

export interface LogRow { id?: unknown; timestamp?: unknown; event_message?: unknown }
export interface LogsResult { rows: LogRow[]; windowsQueried: number; truncated: boolean; start: string; end: string }
type Sleep = (milliseconds: number) => Promise<void>;
export type Fetcher = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;

function apiError(status: number): Error {
  const messages: Record<number, string> = { 401: "Supabase access token is invalid or expired", 402: "Supabase Logs Query requires an eligible plan or billing configuration", 403: "Token lacks permission for this project or organization" };
  return new Error(messages[status] ?? `Supabase Logs API request failed (${status})`);
}

function retryDelay(response: Response): number {
  const reset = response.headers.get("X-RateLimit-Reset");
  if (!reset) return 0;
  const value = Number(reset);
  if (!Number.isFinite(value)) return 0;
  const milliseconds = value > 1_000_000_000_000 ? value - Date.now() : value * 1000 - Date.now();
  return Math.max(0, Math.min(60_000, milliseconds));
}

export async function collectLogs(projectRef: string, accessToken: string, days: number, fetcher: Fetcher = globalThis.fetch as Fetcher, sleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = new Date()): Promise<LogsResult> {
  const windows = createLogWindows(days, now);
  const rows: LogRow[] = [];
  for (const window of windows) {
    const url = new URL(`https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/analytics/endpoints/logs`);
    url.searchParams.set("sql", SLOW_LOG_QUERY);
    url.searchParams.set("iso_timestamp_start", window.start.toISOString());
    url.searchParams.set("iso_timestamp_end", window.end.toISOString());
    let response: Response | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await fetcher(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(30_000) });
      } catch (error) {
        throw new Error(`Supabase Logs API network error: ${error instanceof Error ? error.message : "request failed"}`);
      }
      if (response.status !== 429 || attempt === 1) break;
      await sleep(retryDelay(response));
    }
    if (!response?.ok) throw apiError(response?.status ?? 500);
    const body: unknown = await response.json();
    const result = Array.isArray(body) ? body : body && typeof body === "object" && Array.isArray((body as { result?: unknown }).result) ? (body as { result: unknown[] }).result : undefined;
    if (!result) throw new Error("Supabase Logs API returned an unexpected response; expected an array or a result array");
    rows.push(...result as LogRow[]);
  }
  return { rows, windowsQueried: windows.length, truncated: rows.length > days * 500, start: windows[0]!.start.toISOString(), end: windows.at(-1)!.end.toISOString() };
}

export type { LogWindow };
