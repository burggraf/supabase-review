import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MAX_STDOUT = 10 * 1024 * 1024;
const MAX_STDERR = 4 * 1024;
const REMOVED_ENV = ["DATABASE_URL", "TEST_DATABASE_URL", "SUPABASE_ACCESS_TOKEN", "SUPABASE_REVIEW_LLM_COMMAND", "PGPASSWORD", "PGSERVICE", "PGPASSFILE"];

export interface CommandResult { stdout: string; stderr: string; }
export interface CommandOptions { platform?: NodeJS.Platform; env?: Record<string, string | undefined>; timeoutMs?: number; spawn?: typeof Bun.spawn; }

function shell(command: string, platform: NodeJS.Platform, env: Record<string, string | undefined>): [string, string[]] {
  if (platform === "win32") return [env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", command]];
  return ["/bin/sh", ["-c", command]];
}

async function readLimited(stream: ReadableStream<Uint8Array>, limit: number): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) throw new Error(`command output exceeded ${limit} bytes`);
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(merged);
}

export function commandFingerprint(command: string): string {
  return createHash("sha256").update(command).digest("hex");
}

export async function runLlmCommand(command: string, prompt: string, options: CommandOptions = {}): Promise<CommandResult> {
  const platform = options.platform ?? process.platform;
  const sourceEnv = options.env ?? process.env;
  const env = Object.fromEntries(Object.entries(sourceEnv).filter(([key, value]) => !REMOVED_ENV.includes(key) && value !== undefined)) as Record<string, string>;
  const [executable, args] = shell(command, platform, sourceEnv);
  const cwd = await mkdtemp(join(tmpdir(), "supabase-review-llm-"));
  const spawn = options.spawn ?? Bun.spawn;
  const child = spawn([executable, ...args], { cwd, env, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await child.stdin.write(prompt);
    child.stdin.end();
    const output = Promise.all([readLimited(child.stdout, MAX_STDOUT), readLimited(child.stderr, MAX_STDERR)]);
    const timeout = options.timeoutMs === undefined ? undefined : new Promise<never>((_, reject) => {
      timer = setTimeout(() => { child.kill(); reject(new Error(`LLM command timed out after ${options.timeoutMs} ms`)); }, options.timeoutMs);
    });
    const exit = timeout ? await Promise.race([child.exited, timeout]) : await child.exited;
    if (typeof exit !== "number") throw new Error("LLM command timed out");
    if (exit !== 0) throw new Error(`LLM command exited with code ${exit}`);
    const [rawStdout, rawStderr] = await output;
    const stdout = rawStdout.replace(/[\u001b\u009b][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g, "").trim();
    if (!stdout) throw new Error("LLM command returned empty stdout");
    return { stdout, stderr: rawStderr.replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g, "").slice(0, MAX_STDERR) };
  } finally {
    if (timer) clearTimeout(timer);
    child.kill();
    await rm(cwd, { recursive: true, force: true });
  }
}

export async function validateLlmCommand(command: string, options: CommandOptions = {}): Promise<boolean> {
  const result = await runLlmCommand(command, "This is a connectivity and authentication check. Reply with exactly this token and no other text:\nSUPABASE_REVIEW_READY", { ...options, timeoutMs: 60_000 });
  return result.stdout.split(/\s+/).includes("SUPABASE_REVIEW_READY");
}
