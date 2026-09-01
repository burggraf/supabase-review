export interface LogWindow { start: Date; end: Date }

export function createLogWindows(days: number, end = new Date()): LogWindow[] {
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error("days must be an integer from 1 to 90");
  const endMs = end.getTime();
  const startMs = endMs - days * 24 * 60 * 60 * 1000;
  const windows: LogWindow[] = [];
  for (let cursor = startMs; cursor < endMs;) {
    const next = Math.min(cursor + 24 * 60 * 60 * 1000, endMs);
    windows.push({ start: new Date(cursor), end: new Date(next) });
    cursor = next;
  }
  return windows;
}
