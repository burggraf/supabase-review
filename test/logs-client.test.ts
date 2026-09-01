import { expect, test } from "bun:test";
import { collectLogs } from "../src/logs/client";
import { createLogWindows } from "../src/logs/windows";

test("creates contiguous UTC windows no longer than 24 hours", () => {
  for (const days of [1, 2, 7, 90]) {
    const windows = createLogWindows(days, new Date("2026-11-01T12:00:00Z"));
    expect(windows).toHaveLength(days);
    for (let i = 0; i < windows.length; i++) {
      expect(windows[i]!.end.getTime() - windows[i]!.start.getTime()).toBeLessThanOrEqual(86400000);
      if (i) expect(windows[i]!.start).toEqual(windows[i - 1]!.end);
    }
  }
});

test("requests the supported endpoint and parses rows", async () => {
  const requests: Request[] = [];
  const result = await collectLogs("project", "secret-token", 1, async (input, init) => {
    requests.push(new Request(input, init));
    return new Response(JSON.stringify([{ id: 1, event_message: "duration: 2 ms" }]));
  }, undefined, new Date("2026-09-01T00:00:00Z"));
  expect(new URL(requests[0]!.url).pathname).toBe("/v1/projects/project/analytics/endpoints/logs");
  expect(new URL(requests[0]!.url).searchParams.get("sql")).toContain("postgres_logs");
  expect(requests[0]!.headers.get("authorization")).toBe("Bearer secret-token");
  expect(result.rows).toHaveLength(1);
});

test("retries rate limits once and maps auth errors", async () => {
  let attempts = 0;
  const sleeps: number[] = [];
  const result = await collectLogs("project", "token", 1, async () => {
    attempts++;
    return attempts === 1 ? new Response("", { status: 429, headers: { "X-RateLimit-Reset": "0" } }) : new Response("[]");
  }, async (milliseconds) => { sleeps.push(milliseconds); }, new Date("2026-09-01T00:00:00Z"));
  expect(result.rows).toEqual([]);
  expect(attempts).toBe(2);
  expect(sleeps).toEqual([0]);
  await expect(collectLogs("project", "token", 1, async () => new Response("", { status: 401 }), undefined, new Date("2026-09-01T00:00:00Z"))).rejects.toThrow("invalid or expired");
});
