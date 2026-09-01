# Standalone Supabase Performance Review CLI Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Build a local, self-contained CLI that collects Supabase/PostgreSQL performance evidence, optionally enriches it with the user's Supabase project logs, and optionally generates detailed and executive reports by piping prompts to an LLM command already installed and authenticated by the user.

**Architecture:** A Bun/TypeScript application runs 13 static, read-only inspection queries directly through Bun's PostgreSQL client, writes normalized evidence and a deterministic facts report locally, optionally queries the supported Supabase Management API logs endpoint in 24-hour windows, and optionally passes a redacted evidence subset to a user-configured command through standard input. The command runner validates authentication and prompt/output handling with a harmless preflight prompt unless explicitly skipped. Bun compiles the application and its runtime dependencies into one executable per OS/architecture; end users do not install Bun, Node, TypeScript, Python, or the Supabase CLI.

**Tech Stack:** Bun and TypeScript, Bun SQL PostgreSQL client, native `fetch`, `Bun.spawn`, `node:util.parseArgs`, `@inquirer/prompts`, Bun test, GitHub Actions.

---

## 1. Portable project context

This section replaces the context that existed in the `success-scripts` repository. Copy this plan into the new repository before implementation.

### Original workflow

The old workflow:

1. Accepted a PostgreSQL connection URI.
2. Ran every `supabase inspect db` command, including deprecated aliases that duplicated active queries.
3. Called an internal/shared Logflare endpoint named `Success.ProjectLogs` with `LOGFLARE_KEY`.
4. Optionally parsed slow query/`auto_explain` log messages.
5. Ran the Claude Code CLI over the output directory.
6. Produced a detailed Markdown report, an executive Markdown report, and PDFs.

### Decisions already made

- Product form: local CLI, not hosted SaaS or Tauri GUI.
- Distribution: self-contained native executables.
- Runtime implementation: TypeScript compiled with Bun.
- Windows ARM64 is a required release target.
- Database queries run directly; the released tool must not shell out to `supabase`, `psql`, Python, Node, or Bun.
- Only the 13 current, non-deprecated Supabase inspection queries are included.
- Logflare credentials and `Success.ProjectLogs` are not supported.
- Hosted project logs use `GET https://api.supabase.com/v1/projects/{ref}/analytics/endpoints/logs`.
- `logs.all` must never be used; it is removed on 2026-09-23.
- Logs and external-LLM reporting are independently optional and require explicit consent.
- The tool does not request, store, or manage LLM credentials. Users authenticate their chosen CLI before running this tool.
- Any command that accepts a text prompt on standard input and writes its final response to standard output may be used.
- LLM command pre-validation is enabled by default and may be bypassed explicitly.
- Markdown and JSON are first-class outputs. PDF generation is excluded from v1.
- No telemetry and no credential persistence.

### User-facing commands

```text
supabase-review run [options]
supabase-review collect [options]
supabase-review report <evidence.json> [options]
supabase-review self-test
supabase-review --version
supabase-review --help
```

Behavior:

- `run`: collect database evidence, optionally collect logs, write `facts.md`, and optionally generate LLM reports through the configured command.
- `collect`: collect evidence and write `facts.md`; never invoke an LLM command.
- `report`: read an existing `evidence.json` and generate reports without reconnecting to PostgreSQL or Supabase.
- `self-test`: perform offline checks of the embedded query registry, output writer, and version metadata.

Supported options:

```text
--output <directory>       Output directory; default is a timestamped directory
--project-ref <ref>        Override project ref inference; not secret
--days <1-90>              Requested log lookback; default 7
--with-logs                Explicitly enable Supabase logs collection
--with-llm                 Explicitly enable external-command report generation for `run`
--llm-command <command>    Shell command that reads a prompt from stdin and writes its answer to stdout
--skip-llm-validation      Skip the default harmless command/authentication preflight
--no-redact                Disable default LLM-payload redaction after confirmation
--non-interactive          Never prompt; required inputs must come from environment
--help
--version
```

Do **not** accept database URLs or Supabase tokens as command-line flags because command arguments can appear in process listings. The LLM command is not treated as a credential, but warn users not to embed API keys or tokens in it.

Environment inputs:

```text
DATABASE_URL                       PostgreSQL connection URI
SUPABASE_PROJECT_REF               Optional project ref override
SUPABASE_ACCESS_TOKEN              Required only with --with-logs
SUPABASE_REVIEW_LLM_COMMAND        Optional LLM command; alternative to --llm-command
```

Interactive mode may ask for missing database/Supabase secrets with a masked password prompt and for the LLM command with a normal text prompt. It must never ask for LLM credentials. Non-interactive mode fails with an actionable message when a required value is absent.

The command contract is deliberately small:

1. The configured command is executed through the platform shell.
2. The complete prompt is written to the command's standard input as UTF-8 and then stdin is closed.
3. The command's standard output is the report body.
4. Standard error is treated as diagnostics and included only in bounded, sanitized failure messages.
5. Authentication, model choice, and provider-specific flags belong to the user's command/configuration.

Verified examples at plan-update time:

```text
claude -p --tools "" --permission-mode plan --output-format text
codex exec --sandbox read-only --ephemeral --skip-git-repo-check -
gemini -p "" --approval-mode plan --output-format text
```

These CLIs change independently. Users should confirm syntax with their installed tool's `--help`. A provider CLI that cannot consume stdin may be adapted with a user-owned wrapper script that reads stdin and invokes it; this tool will not interpolate project evidence into a shell command or process argument.

### Output contract

Each collection creates a new directory; never overwrite an existing run.

```text
supabase-review-<project-or-database>-<YYYYMMDD-HHmmssZ>/
├── evidence.json
├── facts.md
├── analysis.json             # only when the external LLM command succeeds
├── report.md                 # only when the external LLM command succeeds
└── executive-summary.md      # only when the external LLM command succeeds
```

`evidence.json` is sufficient to regenerate every report without database access. It must never contain the database URL, database password, or Supabase token. `analysis.json` stores only a SHA-256 fingerprint of the LLM command, never the full command, because users may mistakenly include sensitive flags.

### Exit codes

| Code | Meaning |
|---:|---|
| 0 | Requested outputs were produced; individual optional checks may have warnings |
| 1 | Invalid or missing input |
| 2 | Database connection failed or every database check failed |
| 3 | Report generation failed; collected evidence remains available |
| 130 | User canceled an interactive prompt |

Logs are optional enrichment. Logs failures produce warnings and evidence status but do not fail a successful database collection.

## 2. Repository layout

Use this exact initial layout:

```text
supabase-performance-review/
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
├── docs/
│   ├── implementation-plan.md
│   ├── query-provenance.md
│   └── security.md
├── scripts/
│   └── build.ts
├── src/
│   ├── cli.ts
│   ├── args.ts
│   ├── config.ts
│   ├── prompts.ts
│   ├── types.ts
│   ├── io.ts
│   ├── redact.ts
│   ├── version.ts
│   ├── collect.ts
│   ├── db/
│   │   ├── client.ts
│   │   ├── collect.ts
│   │   ├── registry.ts
│   │   ├── schemas.ts
│   │   └── queries/
│   │       ├── db-stats.ts
│   │       ├── replication-slots.ts
│   │       ├── locks.ts
│   │       ├── blocking.ts
│   │       ├── outliers.ts
│   │       ├── calls.ts
│   │       ├── index-stats.ts
│   │       ├── long-running-queries.ts
│   │       ├── bloat.ts
│   │       ├── role-stats.ts
│   │       ├── vacuum-stats.ts
│   │       ├── table-stats.ts
│   │       └── traffic-profile.ts
│   ├── logs/
│   │   ├── client.ts
│   │   ├── windows.ts
│   │   ├── query.ts
│   │   └── parse.ts
│   └── report/
│       ├── facts.ts
│       ├── payload.ts
│       ├── prompt.ts
│       └── command.ts
├── test/
│   ├── fixtures/
│   │   ├── evidence.json
│   │   ├── logs.json
│   │   └── logs-unparseable.json
│   ├── args.test.ts
│   ├── config.test.ts
│   ├── io.test.ts
│   ├── redact.test.ts
│   ├── collect.test.ts
│   ├── db-registry.test.ts
│   ├── db-client.live.test.ts
│   ├── logs-client.test.ts
│   ├── logs-parse.test.ts
│   ├── facts.test.ts
│   ├── report-payload.test.ts
│   ├── report-command.test.ts
│   └── cli.test.ts
├── .gitignore
├── LICENSE
├── README.md
├── THIRD_PARTY_NOTICES.md
├── bun.lock
├── package.json
└── tsconfig.json
```

## 3. Core data contracts

Implement these concepts in `src/types.ts`; exact naming may vary only if tests and serialized field names stay stable.

```ts
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
  error?: {
    code?: string;
    message: string;
    hint?: string;
  };
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
```

Serialization rules:

- Timestamps are UTC ISO-8601 strings.
- PostgreSQL `bigint` values remain strings when they exceed safe JavaScript integers.
- `Date` values become ISO strings.
- `undefined` is omitted.
- Errors are sanitized before serialization.
- Maximum retained rows per database check: 5,000. Record `truncated: true` when capped.
- Maximum slow-log rows fetched per 24-hour window: 500.
- Maximum retained parsed slow-query groups: 2,000.
- LLM payload uses at most 200 rows per database check and 200 slow-query groups; omissions are stated in the payload.

## 4. Database query provenance and required set

Port the exact SQL embedded in section 12. It was extracted from the MIT-licensed Supabase CLI, pinned to commit:

```text
713129cc1cd27c1d9371554d870c2972914ab12b
```

Raw source base:

```text
https://raw.githubusercontent.com/supabase/cli/713129cc1cd27c1d9371554d870c2972914ab12b/apps/cli/src/legacy/commands/inspect/db
```

For each command `<id>`, the source is:

```text
<base>/<id>/<id>.query.ts
```

Copy the static SQL from section 12 and the required parameter construction into the matching file under `src/db/queries/`. Use the immutable URLs to verify the embedded snapshot and retain attribution; building the new repository must not depend on having the Supabase CLI installed. Keep an attribution comment with the commit and source URL. Do not copy CLI rendering code.

Required checks and expected result keys:

| ID | Expected keys |
|---|---|
| `db-stats` | `database_size`, `total_index_size`, `total_table_size`, `total_toast_size`, `time_since_stats_reset`, `index_hit_rate`, `table_hit_rate`, `wal_size` |
| `replication-slots` | `slot_name`, `active`, `state`, `replication_client_address`, `replication_lag_gb` |
| `locks` | `pid`, `relname`, `transactionid`, `granted`, `stmt`, `age` |
| `blocking` | `blocked_pid`, `blocking_statement`, `blocking_duration`, `blocking_pid`, `blocked_statement`, `blocked_duration` |
| `outliers` | `query`, `total_exec_time`, `prop_exec_time`, `ncalls`, `sync_io_time` |
| `calls` | `query`, `total_exec_time`, `prop_exec_time`, `ncalls`, `sync_io_time` |
| `index-stats` | `name`, `table`, `columns`, `size`, `percent_used`, `index_scans`, `seq_scans`, `unused` |
| `long-running-queries` | `pid`, `duration`, `query` |
| `bloat` | `type`, `name`, `bloat`, `waste` |
| `role-stats` | `role_name`, `active_connections`, `connection_limit`, `custom_config` |
| `vacuum-stats` | `name`, `last_vacuum`, `last_autovacuum`, `last_analyze`, `last_autoanalyze`, `rowcount`, `dead_rowcount`, `expect_autovacuum`, `expect_autoanalyze` |
| `table-stats` | `name`, `table_size`, `index_size`, `total_size`, `estimated_row_count`, `seq_scans` |
| `traffic-profile` | `schemaname`, `table_name`, `blocks_read`, `write_tuples`, `blocks_write`, `activity_ratio` |

Run them in the table order above. It keeps `outliers` and `calls` ahead of the heavier later checks and matches the established workflow.

The schema-filtered queries use these patterns, transformed for PostgreSQL `LIKE ANY` by replacing `_` with `\_` and `*` with `%`:

```text
information_schema
pg_*
_analytics
_realtime
_supavisor
auth
etl
extensions
pgbouncer
realtime
storage
supabase_functions
supabase_migrations
cron
dbdev
graphql
graphql_public
net
pgmq
pgsodium
pgsodium_masks
pgtle
repack
tiger
tiger_data
timescaledb_*
_timescaledb_*
topology
vault
```

Do not port these deprecated aliases:

```text
cache-hit
index-usage
total-index-size
index-sizes
unused-indexes
seq-scans
table-record-counts
table-sizes
table-index-sizes
total-table-sizes
role-configs
role-connections
```

They route to consolidated active queries and duplicate evidence. In particular, current Supabase CLI source warns that `table-record-counts` maps to `table-stats` while actually running `index-stats`; excluding aliases avoids preserving that inconsistency.

## 5. Supabase logs contract

Use native `fetch`; do not add `supabase-management-js` because the inspected generated client still targeted deprecated `logs.all`.

Request:

```text
GET https://api.supabase.com/v1/projects/{ref}/analytics/endpoints/logs
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

Query parameters:

```text
sql=<URL-encoded ClickHouse SQL>
iso_timestamp_start=<UTC ISO timestamp>
iso_timestamp_end=<UTC ISO timestamp>
```

Use this ClickHouse SQL, based on the current Supabase MCP implementation and current Logs documentation:

```sql
SELECT id, timestamp, event_message
FROM logs
WHERE source = 'postgres_logs'
  AND positionCaseInsensitive(event_message, 'duration:') > 0
ORDER BY timestamp DESC
LIMIT 500
```

Rules:

- Every time window must be no longer than 24 hours.
- Generate contiguous UTC windows from oldest to newest; the final window ends at the collection start time.
- Default lookback is 7 days; allowed range is 1-90.
- Response is expected to be a JSON array. Reject unexpected shapes with an actionable error.
- Use a 30-second request timeout.
- On `429`, read `X-RateLimit-Reset`, wait once, then retry. Cap the wait at 60 seconds and total attempts at 2.
- Map `401` to invalid/expired token guidance.
- Map `403` to project permission/organization guidance.
- Map `402` to plan/billing guidance.
- Do not include the access token in URLs, logs, errors, or evidence.
- Do not query all log sources.
- Do not call `query.logflare.app`, `api.logflare.app`, `Success.ProjectLogs`, or `logs.all`.
- Interactive mode must explain that Logs Query usage may be billable before enabling it.

Project ref inference supports:

1. Direct host: `db.<project-ref>.supabase.co`.
2. Pooler username: `postgres.<project-ref>`.
3. Explicit `--project-ref` or `SUPABASE_PROJECT_REF` override.

If inference fails, database collection still works; logs require an explicit ref.

## 6. Slow-log parsing contract

The old parser assumed every `duration:` event contained an `auto_explain` plan and used quadratic string similarity. Replace it with a tolerant linear parser.

For each event:

- Parse timestamp from ISO text or numeric epoch/microsecond values.
- Extract `duration: <number> ms` when present.
- Remove a leading `duration: ... Query Text:` header from query text.
- Split query from plan at the first line containing `(cost=<number>..<number>`.
- Extract scan/join names from this fixed list:
  - `Seq Scan`
  - `Index Scan`
  - `Parallel Seq Scan`
  - `Parallel Index Scan`
  - `Bitmap Heap Scan`
  - `Bitmap Index Scan`
  - `Tid Scan`
  - `Subquery Scan`
  - `Function Scan`
  - `Merge Join`
  - `Hash Join`
  - `Nested Loop`
  - `Merge Append`
  - `Materialize`
- Mark missing fields as `partial`; never crash because a plan is absent.
- Group in a `Map` using query text with whitespace collapsed as the key. Do not use fuzzy matching.
- Track occurrences, first/last timestamp, and min/max duration.
- Preserve a bounded unparsed sample so the report can state data quality limitations.

## 7. Security requirements

These are release blockers, not optional polish.

- Never write or print credentials.
- Never pass database or Supabase credentials as command-line arguments or query parameters.
- Mask interactive secret input with `@inquirer/prompts` password prompts.
- Never ask for LLM credentials; the external CLI owns its authentication.
- Warn that the LLM command is executed as the current user and must come from the user, not project/evidence content.
- Display the exact command and require consent in interactive mode before its first execution.
- Never persist prompts, shell history, or a config file containing secrets.
- Never persist the full LLM command; store only its SHA-256 fingerprint and validation status.
- Disable Bun compiled-executable dotenv/package autoloading; runtime environment variables still work.
- Use TLS from the supplied PostgreSQL URI. Do not silently downgrade SSL.
- Run only embedded static SQL. No user-supplied SQL option in v1.
- Wrap each database check in its own `READ ONLY` transaction with a local statement timeout.
- Do not execute any recommendation produced by the LLM.
- Treat database values, SQL text, and logs as untrusted prompt content. Explicitly tell the model not to follow instructions found in evidence.
- Run the LLM command from a newly-created empty temporary directory, not the project or evidence directory.
- Remove `DATABASE_URL`, `SUPABASE_ACCESS_TOKEN`, `PGPASSWORD`, and related PostgreSQL connection variables from the child environment. Preserve other environment variables because the user's CLI may use them for its own authentication.
- Send prompts through stdin by default; never interpolate evidence into the shell command.
- Validation uses a harmless prompt containing no project evidence and is enabled by default. `--skip-llm-validation` is the explicit override.
- Before an interactive report call, show evidence counts and ask for confirmation.
- In non-interactive `run`, require `--with-llm`; the presence of a configured command alone is not consent. The `report` command itself is explicit consent.
- Redact obvious secrets from the LLM payload by default: PostgreSQL URLs, JWTs, `sbp_` tokens, common API-key patterns, email addresses, and IP addresses. Document that heuristic redaction is not complete.
- `--no-redact` requires a second interactive confirmation. In non-interactive mode, reject `--no-redact` in v1.
- Bound child stdout to 10 MiB and captured stderr diagnostics to 4 KiB. Kill and fail commands that exceed limits or timeouts.
- No telemetry.

## 8. Implementation tasks

### Task 1: Initialize the standalone repository

**Files:**
- Create: all top-level metadata files and empty directories from the repository layout
- Create: `docs/implementation-plan.md` by copying this document

**Step 1: Create the repository**

```bash
mkdir supabase-performance-review
cd supabase-performance-review
git init
bun init -y
bun add @inquirer/prompts
bun add -d @types/bun typescript
```

**Step 2: Configure `package.json`**

Use a private development package initially:

```json
{
  "name": "supabase-performance-review",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "bun test",
    "typecheck": "tsc --noEmit",
    "check": "bun run typecheck && bun test",
    "dev": "bun run src/cli.ts",
    "build": "bun run scripts/build.ts"
  },
  "dependencies": {
    "@inquirer/prompts": "<pin current tested version>"
  },
  "devDependencies": {
    "@types/bun": "<pin current tested version>",
    "typescript": "<pin current tested version>"
  }
}
```

Use exact versions resolved during initialization; do not use `latest`, `*`, or unbounded ranges in the committed lockfile.

**Step 3: Configure TypeScript**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Preserve",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "types": ["bun"],
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "scripts", "test"]
}
```

**Step 4: Add license and provenance placeholders**

- Use MIT for the new project unless ownership requires another compatible license.
- Add Supabase CLI MIT attribution to `THIRD_PARTY_NOTICES.md`.
- Add the pinned commit and 13 source paths to `docs/query-provenance.md`.

**Step 5: Verify and commit**

```bash
bun install --frozen-lockfile
bun run typecheck
git add .
git commit -m "chore: initialize standalone CLI"
```

Expected: typecheck exits 0; repository contains no copied customer output or secrets.

### Task 2: Define evidence types and safe file output

**Files:**
- Create: `src/types.ts`
- Create: `src/io.ts`
- Create: `test/io.test.ts`

**Step 1: Write failing tests**

Cover:

- recursive conversion of `Date` to ISO strings;
- preservation of large integer strings;
- omission of `undefined`;
- atomic JSON write through `<name>.tmp` then rename;
- refusal to overwrite an existing run directory;
- filename-safe timestamp generation on Windows (`:` is forbidden).

Run:

```bash
bun test test/io.test.ts
```

Expected: FAIL because `src/io.ts` does not exist.

**Step 2: Implement the contracts from section 3**

Expose:

```ts
export function normalizeJson(value: unknown): unknown;
export function createRunDirectory(base: string, label: string, now: Date): Promise<string>;
export function writeJsonAtomic(path: string, value: unknown): Promise<void>;
export function writeTextAtomic(path: string, value: string): Promise<void>;
```

Use `Bun.write`, `rename`, and `mkdir`; do not add a filesystem dependency.

**Step 3: Run tests and commit**

```bash
bun test test/io.test.ts
bun run typecheck
git add src/types.ts src/io.ts test/io.test.ts
git commit -m "feat: add evidence and output contracts"
```

### Task 3: Implement arguments, environment resolution, and masked prompts

**Files:**
- Create: `src/args.ts`
- Create: `src/config.ts`
- Create: `src/prompts.ts`
- Create: `test/args.test.ts`
- Create: `test/config.test.ts`

**Step 1: Write failing parser tests**

Use `node:util.parseArgs`. Test all commands/options, unknown option rejection, `days` boundaries, default command `run`, and absence of secret-valued flags.

**Step 2: Write failing config tests**

Test precedence:

1. non-secret command option;
2. environment variable;
3. interactive masked prompt;
4. actionable failure in `--non-interactive` mode.

Test direct-host and pooler-username project ref inference with percent-encoded passwords. Separately test LLM command precedence: `--llm-command`, then `SUPABASE_REVIEW_LLM_COMMAND`, then interactive text prompt; non-interactive report generation without any command must fail. Test that `--skip-llm-validation` defaults to false.

**Step 3: Implement minimal parsing and prompts**

Use:

```ts
import { input, password, confirm } from "@inquirer/prompts";
```

- Database URL and PAT use `password({ mask: "*" })`.
- The LLM command uses `input()` and is shown back to the user for confirmation; never prompt for provider credentials.
- Catch Inquirer's `ExitPromptError` and return exit code 130 without a stack trace.
- Validate PostgreSQL URI schemes as `postgres:` or `postgresql:`.
- Never include the parsed URL in an error.

**Step 4: Verify and commit**

```bash
bun test test/args.test.ts test/config.test.ts
bun run typecheck
git add src/args.ts src/config.ts src/prompts.ts test/args.test.ts test/config.test.ts
git commit -m "feat: add secure CLI configuration"
```

### Task 4: Port and verify the 13-query registry

**Files:**
- Create: `src/db/schemas.ts`
- Create: `src/db/registry.ts`
- Create: all 13 `src/db/queries/*.ts` files
- Create: `test/db-registry.test.ts`
- Update: `docs/query-provenance.md`
- Update: `THIRD_PARTY_NOTICES.md`

**Step 1: Write registry safety tests**

Assert:

- exactly 13 IDs in the required order;
- every ID is unique;
- no deprecated alias appears;
- each SQL string has an immutable source URL comment;
- after comments are removed, each query begins with `SELECT` or `WITH`;
- no query contains statement-level mutation keywords: `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `DROP`, `CREATE`, `TRUNCATE`, `COPY`, `CALL`, or `DO`;
- expected result keys match section 4.

Run and confirm failure:

```bash
bun test test/db-registry.test.ts
```

**Step 2: Port one query at a time**

Each query module exports a `QueryDefinition`:

```ts
export interface QueryDefinition {
  id: string;
  title: string;
  sql: string;
  expectedKeys: readonly string[];
  params(context: { databaseName: string }): readonly unknown[];
  source: string;
}
```

For schema-filtered queries, include the escaped internal schema array. Add explicit `$1::text[]` casts if Bun's live test shows array inference is ambiguous; document any change from upstream.

**Step 3: Run tests after every query**

```bash
bun test test/db-registry.test.ts
```

Expected after the thirteenth query: PASS with registry length 13.

**Step 4: Commit**

```bash
git add src/db docs/query-provenance.md THIRD_PARTY_NOTICES.md test/db-registry.test.ts
git commit -m "feat: port active Supabase inspection queries"
```

### Task 5: Implement the read-only database collector

**Files:**
- Create: `src/db/client.ts`
- Create: `src/db/collect.ts`
- Create: `test/db-client.live.test.ts`
- Create: `test/collect.test.ts`

**Step 1: Write tests around an injected query executor**

Unit-test:

- serial execution in registry order;
- one failed query does not stop later queries;
- row cap and `truncated` flag;
- sanitized PostgreSQL errors;
- all-failed detection;
- connection closed in `finally`.

**Step 2: Implement Bun SQL connection**

Use:

```ts
import { SQL } from "bun";

const db = new SQL({
  url: databaseUrl,
  max: 1,
  connectionTimeout: 10,
  idleTimeout: 10,
  prepare: false
});
```

`prepare: false` avoids persistent prepared-statement problems with transaction-mode poolers.

Run a preflight query for `current_database()` and `current_setting('server_version')`. Best-effort execute `SET pg_stat_statements.track = 'none'`; ignore only PostgreSQL error `42704` for an unknown setting.

For each check, use a separate transaction:

```sql
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '15s';
```

Then execute the static query with positional parameters. On failure, let that transaction roll back and continue.

Always call:

```ts
await db.close({ timeout: 5 });
```

**Step 3: Add opt-in live test**

`test/db-client.live.test.ts` runs only when `TEST_DATABASE_URL` is set. It must assert at least one successful check and that no mutation occurred. Never place a real URL in fixtures or CI logs.

**Step 4: Verify and commit**

```bash
bun test test/collect.test.ts
TEST_DATABASE_URL='<temporary test database>' bun test test/db-client.live.test.ts
bun run typecheck
git add src/db/client.ts src/db/collect.ts test/collect.test.ts test/db-client.live.test.ts
git commit -m "feat: collect read-only database evidence"
```

If no live database is available during implementation, leave the live test skipped and record that as a release blocker rather than claiming compatibility.

### Task 6: Generate a deterministic facts report

**Files:**
- Create: `src/report/facts.ts`
- Create: `test/facts.test.ts`
- Create: `test/fixtures/evidence.json`

**Step 1: Write a snapshot-style test**

The fixture must include successful, empty, failed, and truncated checks. Assert Markdown contains:

- run/tool/database metadata;
- observation timestamps;
- each check status and duration;
- Markdown tables for rows;
- failed-check messages;
- truncation warnings;
- no credentials or undefined text;
- a statement that this document contains observed facts, not remediation advice.

**Step 2: Implement escaping and rendering**

Export:

```ts
export function renderFacts(evidence: Evidence): string;
```

Use plain string building. Escape pipes and newlines in Markdown cells. Do not add a Markdown framework.

**Step 3: Verify and commit**

```bash
bun test test/facts.test.ts
bun run typecheck
git add src/report/facts.ts test/facts.test.ts test/fixtures/evidence.json
git commit -m "feat: render local facts report"
```

### Task 7: Implement 24-hour log windows and Management API client

**Files:**
- Create: `src/logs/windows.ts`
- Create: `src/logs/query.ts`
- Create: `src/logs/client.ts`
- Create: `test/logs-client.test.ts`

**Step 1: Write failing window tests**

Test 1, 2, 7, and 90 days; daylight-saving boundaries must not matter because all math uses UTC milliseconds. Every interval must be positive and at most 24 hours, with no gaps or overlaps.

**Step 2: Write failing HTTP tests with injected `fetch`**

Assert:

- exact `/analytics/endpoints/logs` path;
- `source = 'postgres_logs'` query;
- timestamps and SQL are URL encoded;
- bearer token appears only in the header;
- array response parsing;
- `401`, `402`, `403`, unexpected JSON, timeout, and network error messages;
- one bounded `429` retry using `X-RateLimit-Reset`;
- no deprecated endpoint or Logflare hostname.

**Step 3: Implement the client**

Export a function accepting injected `fetch` and `sleep` functions so retries are deterministic in tests. Use `AbortSignal.timeout(30_000)`.

**Step 4: Verify and commit**

```bash
bun test test/logs-client.test.ts
bun run typecheck
git add src/logs test/logs-client.test.ts
git commit -m "feat: query hosted Supabase slow logs"
```

### Task 8: Implement tolerant slow-log parsing

**Files:**
- Create: `src/logs/parse.ts`
- Create: `test/logs-parse.test.ts`
- Create: `test/fixtures/logs.json`
- Create: `test/fixtures/logs-unparseable.json`

**Step 1: Write fixture tests**

Cover full `auto_explain`, duration without plan, plan without query header, invalid timestamp, absent duration, duplicate normalized whitespace, and every supported scan type.

**Step 2: Implement the linear parser**

Export:

```ts
export function parseSlowLogs(rows: unknown[]): {
  slowQueries: ParsedSlowQuery[];
  warnings: string[];
  truncated: boolean;
};
```

Use a `Map`; no fuzzy similarity library and no runtime package installation.

**Step 3: Verify and commit**

```bash
bun test test/logs-parse.test.ts
bun run typecheck
git add src/logs/parse.ts test/logs-parse.test.ts test/fixtures
git commit -m "feat: parse slow query logs safely"
```

### Task 9: Orchestrate collection and write outputs

**Files:**
- Create: `src/collect.ts`
- Create: `test/collect.test.ts` or extend the existing file

**Step 1: Write orchestration tests**

Inject database collector, logs collector, clock, and filesystem. Test:

- database-only success;
- logs skipped;
- logs enabled and successful;
- logs failure preserved as warning;
- project ref inference and override;
- all database checks failed returns exit code 2;
- output contains `evidence.json` and `facts.md` even when logs fail;
- output contains no credentials.

**Step 2: Implement collection**

Create the output directory before network work, but write final files atomically. Capture start and completion timestamps. Never discard successful evidence because a later optional step fails.

**Step 3: Verify and commit**

```bash
bun test test/collect.test.ts
bun run typecheck
git add src/collect.ts test/collect.test.ts
git commit -m "feat: orchestrate evidence collection"
```

### Task 10: Add default redaction and bounded LLM payloads

**Files:**
- Create: `src/redact.ts`
- Create: `src/report/payload.ts`
- Create: `test/redact.test.ts`
- Create: `test/report-payload.test.ts`

**Step 1: Write redaction tests**

Include PostgreSQL URLs with percent-encoded passwords, JWTs, `sbp_` PATs, common Anthropic/OpenAI/Google key prefixes (`sk-ant-`, `sk-proj-`, `AIza`), emails, IPv4, IPv6, and ordinary SQL identifiers that must remain intact.

**Step 2: Write payload-bound tests**

Assert 200-row caps, explicit omission counts, retention of check errors/data-quality warnings, and no modification of the original evidence object.

**Step 3: Implement minimal redaction**

Redact only known patterns. Include this exact warning in payload metadata:

```text
Heuristic redaction was applied but is not guaranteed to remove all sensitive or personal data.
```

**Step 4: Verify and commit**

```bash
bun test test/redact.test.ts test/report-payload.test.ts
bun run typecheck
git add src/redact.ts src/report/payload.ts test/redact.test.ts test/report-payload.test.ts
git commit -m "feat: prepare bounded redacted AI evidence"
```

### Task 11: Validate and invoke a user-supplied LLM command

**Files:**
- Create: `src/report/prompt.ts`
- Create: `src/report/command.ts`
- Create: `test/report-command.test.ts`

**Step 1: Write command-runner tests with injected process spawning**

Test both Unix and Windows shell selection:

```text
Unix:    /bin/sh -c <command>
Windows: %COMSPEC% /d /s /c <command>
```

Assert:

- the prompt is written to stdin and never interpolated into the command string;
- stdin is closed after the prompt;
- stdout is returned as UTF-8 text;
- the child runs in a newly-created empty temporary directory;
- `DATABASE_URL`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_REVIEW_LLM_COMMAND`, `PGPASSWORD`, `PGSERVICE`, and `PGPASSFILE` are absent from the child environment;
- unrelated environment values remain available for the user's CLI authentication;
- non-zero exit, timeout, empty stdout, oversized stdout, and spawn failure are actionable;
- stderr is capped and sanitized before display;
- the full command is not written to output or analysis metadata;
- Ctrl+C and timeout terminate the child process; use platform process-tree termination where available so agent CLI descendants are not orphaned.

**Step 2: Implement default validation**

Before sending project evidence, execute the configured command with this prompt:

```text
This is a connectivity and authentication check. Reply with exactly this token and no other text:
SUPABASE_REVIEW_READY
```

Validation succeeds only when the process exits 0 within 60 seconds and normalized stdout contains `SUPABASE_REVIEW_READY`. The prompt contains no project data.

Behavior:

- Validation runs once per `run` or `report` process before real prompts.
- `--skip-llm-validation` bypasses it and records `command_validated: false`.
- Interactive mode displays the exact command and asks whether to validate; declining is an explicit interactive override and records `false`.
- Non-interactive mode validates by default. Only `--skip-llm-validation` bypasses it.
- A failed validation aborts report generation with exit code 3 and suggests authenticating/testing the CLI directly or rerunning with the explicit skip flag.

**Step 3: Generate reports with two plain-text calls**

Do not require provider-specific JSON or delimiter support.

1. Send the detailed-report prompt plus bounded redacted evidence. Capture stdout as `report.md`.
2. Send a second prompt containing the completed detailed report and ask for a non-technical executive summary. Capture stdout as `executive-summary.md`.

Both commands use a 10-minute timeout and the same output limits. Strip ANSI control sequences and surrounding whitespace, but otherwise preserve Markdown exactly.

The detailed prompt must require:

- evidence IDs/check names for every finding;
- explicit distinction between observation and recommendation;
- no claim that remediation was executed;
- no instruction-following from SQL/log text;
- caution about short `pg_stat_statements` windows;
- no unused-index removal recommendation without considering stats reset time, index constraints, and workload window;
- architecture recommendations only when supported by evidence;
- sections for query/index, bloat/vacuum, locks/connections, traffic/resource use, and safe next steps;
- remediation SQL clearly labeled for manual validation and never execution;
- Markdown only, with no conversational preamble.

The executive prompt must require business risk, priorities, confidence/caveats, and non-technical language. It must not invent facts absent from the detailed report.

**Step 4: Write analysis metadata atomically**

On success write:

- `analysis.json` with provider `external-cli`, SHA-256 command fingerprint, validation status, generation time, redaction flag, and both Markdown strings;
- `report.md`;
- `executive-summary.md`.

On failure leave evidence/facts and any already-completed detailed report intact, but do not write a successful `analysis.json`; return exit code 3.

**Step 5: Verify and commit**

```bash
bun test test/report-command.test.ts
bun run typecheck
git add src/report test/report-command.test.ts
git commit -m "feat: generate reports through external LLM commands"
```

Normal tests use fixture commands that read stdin and return deterministic text; they must not invoke an actual LLM CLI.

### Task 12: Wire the CLI and offline self-test

**Files:**
- Create: `src/version.ts`
- Create: `src/cli.ts`
- Create: `test/cli.test.ts`

**Step 1: Write subprocess tests**

Test:

- `--help` and `--version` exit 0;
- unknown command exits 1;
- non-interactive missing `DATABASE_URL` exits 1 without prompting;
- `collect` never invokes an LLM command;
- `report` never invokes PostgreSQL or Supabase;
- `run --with-llm` requires explicit consent and a command;
- command validation runs by default and `--skip-llm-validation` bypasses it;
- Ctrl+C maps to 130;
- partial check failures are warnings with exit 0 when at least one database check succeeds;
- `self-test` is offline and exits 0.

**Step 2: Implement self-test**

It verifies:

- query registry has 13 safe queries;
- version is non-empty;
- temporary atomic write/read/delete works;
- JSON normalization works.

It must not inspect environment credentials, connect to a database, or call a network.

**Step 3: Verify and commit**

```bash
bun test test/cli.test.ts
bun run typecheck
bun run src/cli.ts self-test
bun run src/cli.ts --version
git add src/cli.ts src/version.ts test/cli.test.ts
git commit -m "feat: expose standalone CLI commands"
```

### Task 13: Compile six self-contained target binaries

**Files:**
- Create: `scripts/build.ts`
- Update: `package.json`
- Create: build tests inside `test/cli.test.ts` or a small `test/build.test.ts`

**Required targets:**

```ts
const targets = [
  ["darwin-x64", "bun-darwin-x64"],
  ["darwin-arm64", "bun-darwin-arm64"],
  ["linux-x64", "bun-linux-x64-musl"],
  ["linux-arm64", "bun-linux-arm64-musl"],
  ["windows-x64", "bun-windows-x64"],
  ["windows-arm64", "bun-windows-arm64"]
] as const;
```

Use `.exe` for Windows outputs. Use musl Linux targets for broader compatibility.

**Step 1: Write a build-script test**

Assert target uniqueness, exactly six targets, and presence of `bun-windows-arm64`.

**Step 2: Implement `scripts/build.ts`**

For each requested target call `Bun.build` with:

```ts
{
  entrypoints: ["src/cli.ts"],
  compile: {
    target,
    outfile,
    autoloadDotenv: false,
    autoloadBunfig: false,
    autoloadPackageJson: false
  },
  minify: true,
  define: {
    __VERSION__: JSON.stringify(packageVersion)
  }
}
```

Support `bun run build --target windows-arm64` and `bun run build --all`. Fail if an output is missing or zero bytes.

**Step 3: Build locally**

```bash
bun run build --all
```

Expected artifacts:

```text
dist/supabase-review-darwin-x64
dist/supabase-review-darwin-arm64
dist/supabase-review-linux-x64
dist/supabase-review-linux-arm64
dist/supabase-review-windows-x64.exe
dist/supabase-review-windows-arm64.exe
```

**Step 4: Smoke the native binary**

```bash
./dist/supabase-review-<native-target> --version
./dist/supabase-review-<native-target> self-test
```

Expected: both exit 0 without Bun installed on the test machine/path.

**Step 5: Commit**

```bash
git add scripts/build.ts package.json test
git commit -m "build: compile six standalone binaries"
```

### Task 14: Add cross-platform CI, including native Windows ARM64

**Files:**
- Create: `.github/workflows/ci.yml`

**Native runner matrix:**

| Target | GitHub runner |
|---|---|
| Linux x64 | `ubuntu-24.04` |
| Linux ARM64 | `ubuntu-24.04-arm` |
| macOS x64 | `macos-15-intel` |
| macOS ARM64 | `macos-15` |
| Windows x64 | `windows-2025` |
| Windows ARM64 | `windows-11-vs2026-arm` |

Runner labels are time-sensitive; confirm them against GitHub's hosted-runner reference when implementing. `windows-11-vs2026-arm` was generally available when this plan was written.

**Step 1: Add matrix checks**

Every runner:

1. checks out the repository;
2. installs the pinned Bun version with `oven-sh/setup-bun`;
3. runs `bun install --frozen-lockfile`;
4. runs `bun run typecheck`;
5. runs `bun test`;
6. compiles its native target;
7. runs the compiled binary with `--version` and `self-test`;
8. uploads the binary as a workflow artifact.

Windows PowerShell must invoke `& .\dist\supabase-review-windows-arm64.exe self-test` or the matching x64 path.

**Step 2: Verify CI**

Push a branch and require all six jobs to pass. Windows ARM64 support is not considered complete from cross-compilation alone; the native ARM64 smoke job must execute the binary.

**Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: test all release architectures"
```

### Task 15: Add release packaging and checksums

**Files:**
- Create: `.github/workflows/release.yml`
- Update: `scripts/build.ts` if packaging helpers are needed

**Step 1: Package artifacts**

For tag `vX.Y.Z`, produce:

```text
supabase-review-vX.Y.Z-darwin-x64.tar.gz
supabase-review-vX.Y.Z-darwin-arm64.tar.gz
supabase-review-vX.Y.Z-linux-x64.tar.gz
supabase-review-vX.Y.Z-linux-arm64.tar.gz
supabase-review-vX.Y.Z-windows-x64.zip
supabase-review-vX.Y.Z-windows-arm64.zip
SHA256SUMS
```

Each archive contains only the executable, `LICENSE`, `THIRD_PARTY_NOTICES.md`, and a short installation text file.

**Step 2: Gate release on CI**

A release job must not publish unless all six native CI jobs pass for the tag commit.

**Step 3: Handle signing honestly**

- Beta releases may be unsigned but must say so prominently.
- Production macOS releases require Developer ID signing and notarization.
- Production Windows releases should use Authenticode signing to reduce SmartScreen warnings.
- Never place signing credentials in the repository; use protected GitHub secrets/environments.

Do not build an auto-updater in v1.

**Step 4: Commit**

```bash
git add .github/workflows/release.yml scripts/build.ts
git commit -m "ci: publish standalone release artifacts"
```

### Task 16: Write user, security, and contributor documentation

**Files:**
- Update: `README.md`
- Create: `docs/security.md`
- Finalize: `docs/query-provenance.md`
- Finalize: `THIRD_PARTY_NOTICES.md`

**README requirements:**

- what the tool does and does not do;
- six download choices including Windows ARM64;
- checksum verification examples;
- environment variables and interactive mode;
- database-only example;
- logs example with billing/retention warning;
- report regeneration example;
- explicit statement that database/Supabase credentials remain local but selected evidence is sent to the user's configured LLM command only when requested;
- external-command examples for Claude, Codex, and Gemini, with a warning to verify installed CLI syntax;
- validation behavior, timeout/output limits, `--skip-llm-validation`, and the stdin/stdout contract;
- statement that users authenticate their provider CLI separately and this tool never asks for LLM credentials;
- output file descriptions;
- partial failure behavior;
- no automatic remediation;
- troubleshooting for percent-encoding, SSL, pooler/direct URLs, missing `pg_stat_statements`, 401/403/429, and unavailable logs.

**Security documentation requirements:**

- threat model and trust boundaries;
- process-list reason for excluding secret flags;
- explicit warning that `--llm-command` executes arbitrary local shell code with the current user's permissions;
- recommendation to use only a command the user typed/trusts, keep credentials in that CLI's normal auth store/environment, and use read-only/no-tool provider flags where available;
- statement that project/evidence content can never set or modify the command;
- heuristic redaction limitations;
- how to report a vulnerability;
- supported versions policy;
- no telemetry statement.

**Step: Verify docs and commit**

```bash
rg -n "Windows ARM64|bun-windows-arm64|analytics/endpoints/logs|llm-command|skip-llm-validation|no telemetry" README.md docs
rg -n "Success.ProjectLogs|logs\.all" README.md src docs
```

The second command may find historical explanation in this implementation plan, but must find no executable source or user instruction that calls those endpoints.

```bash
git add README.md docs THIRD_PARTY_NOTICES.md
git commit -m "docs: document standalone review workflow"
```

### Task 17: Run release-candidate acceptance checks

**Files:**
- Modify only files required by failures discovered here

**Step 1: Run local static verification**

```bash
bun install --frozen-lockfile
bun run typecheck
bun test
bun run src/cli.ts self-test
bun run build --all
```

Expected: every command exits 0.

**Step 2: Run live database acceptance**

Use a disposable or explicitly-approved Supabase project:

```bash
DATABASE_URL='<secret in environment>' bun run src/cli.ts collect --non-interactive --output ./acceptance-db
```

Expected:

- at least one successful check;
- exactly 13 check records;
- no deprecated check IDs;
- `evidence.json` and `facts.md` exist;
- grep of output finds no database password.

**Step 3: Run live logs acceptance**

```bash
DATABASE_URL='<secret>' \
SUPABASE_PROJECT_REF='<ref>' \
SUPABASE_ACCESS_TOKEN='<secret>' \
bun run src/cli.ts collect --non-interactive --with-logs --days 1 --output ./acceptance-logs
```

Expected:

- only `/analytics/endpoints/logs` is called;
- logs status is `ok` or an actionable optional error;
- timestamp window is no more than 24 hours;
- token is absent from output.

**Step 4: Run live external-LLM acceptance**

First authenticate one supported CLI directly according to that tool's documentation. Then use the previously-produced evidence. Example with Claude Code reading prompts from stdin:

```bash
bun run src/cli.ts report ./acceptance-logs/evidence.json \
  --non-interactive \
  --llm-command 'claude -p --tools "" --permission-mode plan --output-format text'
```

Expected:

- harmless validation runs first and returns `SUPABASE_REVIEW_READY`;
- report prompts run only after validation;
- `analysis.json`, `report.md`, and `executive-summary.md` are non-empty;
- metadata contains only the command fingerprint, not the command;
- no database/Supabase credential is visible to the child environment.

Repeat once with `--skip-llm-validation` using a deterministic fixture command to verify the override path. The `report` command itself is explicit consent, so it may run non-interactively.

**Step 5: Native artifact acceptance**

Download each CI artifact on its matching architecture and run:

```text
supabase-review --version
supabase-review self-test
```

Windows ARM64 must be run on the `windows-11-vs2026-arm` CI runner or physical Windows ARM64 hardware.

**Step 6: Secret scan outputs and git state**

Use repository-approved secret scanning plus targeted checks for test credentials. Confirm no generated acceptance directories are staged.

```bash
git status --short
git diff --check
```

Expected: clean intended source diff, no generated reports, no credentials.

**Step 7: Commit only verified fixes**

```bash
git add <specific-files>
git commit -m "fix: address release acceptance findings"
```

Do not create an empty acceptance commit.

## 9. Definition of done

The first release is complete only when:

- all 13 active checks run directly through PostgreSQL and each appears once;
- static tests confirm every embedded query is read-only;
- partial database query failures are preserved without aborting later checks;
- a facts-only report works without Supabase credentials or any LLM command;
- hosted logs use only the supported `/analytics/endpoints/logs` endpoint;
- log requests use complete, <=24-hour UTC windows;
- `Success.ProjectLogs`, direct Logflare access, and `logs.all` are absent from runtime source;
- external LLM commands require explicit user action, receive prompts through stdin, and return Markdown through stdout;
- the tool never requests or persists LLM credentials;
- command validation is on by default and the skip path is explicit and recorded;
- LLM evidence is bounded and redacted by default;
- no credentials are written or printed;
- collected evidence can regenerate reports offline from the database;
- all six compiled artifacts exist;
- all six execute native `self-test`, including Windows ARM64;
- release archives include SHA-256 checksums and third-party notices;
- user and security documentation is complete;
- live database, logs, and external-LLM acceptance tests have recorded evidence without committed secrets.

## 10. Explicitly deferred work

Do not include these in v1:

- Tauri/React GUI;
- hosted service;
- Supabase OAuth/project picker;
- provider-specific LLM SDK integrations or provider abstraction beyond the generic command contract;
- PDF renderer;
- automatic index or SQL execution;
- custom/user-provided SQL;
- continuous monitoring or scheduling;
- Log Drains or user-owned Logflare sources;
- keychain credential persistence;
- Homebrew, Scoop, Winget, or npm installers;
- auto-update client;
- telemetry;
- fuzzy query similarity;
- deterministic recommendation/rules engine.

Add these only after usage shows the need.

## 11. Primary external references

- Bun standalone executable targets, including `bun-windows-arm64`: <https://bun.sh/docs/bundler/executables>
- Bun SQL PostgreSQL client: <https://bun.sh/docs/runtime/sql>
- Bun child processes and stdin/stdout piping: <https://bun.sh/docs/runtime/child-process>
- Claude Code CLI non-interactive help: run `claude --help` and use `-p/--print`
- Codex CLI stdin mode: run `codex exec --help` and use prompt `-`
- Gemini CLI headless mode: run `gemini --help` and use `-p/--prompt`
- Inquirer masked password prompt: <https://github.com/SBoudrias/Inquirer.js/tree/main/packages/password>
- Supabase Management API authentication: <https://supabase.com/docs/reference/api/introduction>
- Current Supabase project logs endpoint: <https://supabase.com/docs/reference/api/v1-get-project-logs>
- Supabase hosted log schema and ClickHouse examples: <https://supabase.com/docs/guides/monitoring-and-debugging/logs>
- Supabase MCP current ClickHouse log query source: <https://github.com/supabase/mcp/blob/main/packages/mcp-server-supabase/src/logs.ts>
- Supabase database inspection guide: <https://supabase.com/docs/guides/database/inspect>
- Supabase CLI pinned source: <https://github.com/supabase/cli/tree/713129cc1cd27c1d9371554d870c2972914ab12b/apps/cli/src/legacy/commands/inspect/db>
- GitHub hosted runner labels: <https://docs.github.com/en/actions/reference/runners/github-hosted-runners>

## 12. Embedded SQL snapshot

This appendix makes the plan self-contained. These are the exact SQL strings extracted from Supabase CLI commit `713129cc1cd27c1d9371554d870c2972914ab12b`. The immutable source URLs in section 4 remain the provenance and update-check references. Do not substitute deprecated alias queries.

Parameter bindings:

- `$1` on schema-filtered queries is the escaped `text[]` internal-schema pattern list from section 4.
- `$2` on `db-stats` is the current database name.
- Queries without placeholders receive no parameters.

### `db-stats`

```sql
WITH total_objects AS (
  SELECT c.relkind, pg_size_pretty(SUM(pg_relation_size(c.oid))) AS size
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('i', 'r', 't') AND NOT n.nspname LIKE ANY($1)
  GROUP BY c.relkind
), cache_hit AS (
  SELECT
    'i' AS relkind,
    ROUND(SUM(idx_blks_hit)::numeric / nullif(SUM(idx_blks_hit + idx_blks_read), 0), 2) AS ratio
  FROM pg_statio_user_indexes
  WHERE NOT schemaname LIKE ANY($1)
    UNION
  SELECT
    't' AS relkind,
    /*
      Handle column names for both PG15 and 17
    */
    ROUND(
      (
        SUM(
          COALESCE(
            (to_jsonb(s) ->> 'rel_blks_hit')::bigint,
            (to_jsonb(s) ->> 'heap_blks_hit')::bigint,
            0
          )
        )::numeric
        /
        nullif(
          SUM(
            COALESCE(
              (to_jsonb(s) ->> 'rel_blks_hit')::bigint,
              (to_jsonb(s) ->> 'heap_blks_hit')::bigint,
              0
            )
            +
            COALESCE(
              (to_jsonb(s) ->> 'rel_blks_read')::bigint,
              (to_jsonb(s) ->> 'heap_blks_read')::bigint,
              0
            )
          ),
          0
        )
      ),
      2
    ) AS ratio
  FROM pg_statio_user_tables s
  WHERE NOT schemaname LIKE ANY($1)
)
SELECT
  pg_size_pretty(pg_database_size($2)) AS database_size,
  COALESCE((SELECT size FROM total_objects WHERE relkind = 'i'), '0 bytes') AS total_index_size,
  COALESCE((SELECT size FROM total_objects WHERE relkind = 'r'), '0 bytes') AS total_table_size,
  COALESCE((SELECT size FROM total_objects WHERE relkind = 't'), '0 bytes') AS total_toast_size,
  COALESCE((SELECT (now() - stats_reset)::text FROM extensions.pg_stat_statements_info), 'N/A') AS time_since_stats_reset,
  (SELECT COALESCE(ratio::text, 'N/A') FROM cache_hit WHERE relkind = 'i') AS index_hit_rate,
  (SELECT COALESCE(ratio::text, 'N/A') FROM cache_hit WHERE relkind = 't') AS table_hit_rate,
  COALESCE((SELECT pg_size_pretty(SUM(size)) FROM pg_ls_waldir()), '0 bytes') AS wal_size
```

### `replication-slots`

```sql
SELECT
  s.slot_name,
  s.active,
  COALESCE(r.state, 'N/A') as state,
  CASE WHEN r.client_addr IS NULL
    THEN 'N/A'
    ELSE r.client_addr::text
  END replication_client_address,
  GREATEST(0, ROUND((redo_lsn-restart_lsn)/1024/1024/1024, 2)) as replication_lag_gb
FROM pg_control_checkpoint(), pg_replication_slots s
LEFT JOIN pg_stat_replication r ON (r.pid = s.active_pid)
```

### `locks`

```sql
SELECT
  pg_stat_activity.pid,
  COALESCE(pg_class.relname, 'null') AS relname,
  COALESCE(pg_locks.transactionid::text, 'null') AS transactionid,
  pg_locks.granted,
  pg_stat_activity.query AS stmt,
  age(now(), pg_stat_activity.query_start)::text AS age
FROM pg_stat_activity, pg_locks LEFT OUTER JOIN pg_class ON (pg_locks.relation = pg_class.oid)
WHERE pg_stat_activity.query <> '<insufficient privilege>'
AND pg_locks.pid = pg_stat_activity.pid
AND pg_locks.mode = 'ExclusiveLock'
ORDER BY query_start
```

### `blocking`

```sql
SELECT
  bl.pid AS blocked_pid,
  ka.query AS blocking_statement,
  age(now(), ka.query_start)::text AS blocking_duration,
  kl.pid AS blocking_pid,
  a.query AS blocked_statement,
  age(now(), a.query_start)::text AS blocked_duration
FROM pg_catalog.pg_locks bl
JOIN pg_catalog.pg_stat_activity a
  ON bl.pid = a.pid
JOIN pg_catalog.pg_locks kl
JOIN pg_catalog.pg_stat_activity ka
  ON kl.pid = ka.pid
  ON bl.transactionid = kl.transactionid AND bl.pid != kl.pid
WHERE NOT bl.granted
```

### `outliers`

```sql
SELECT
  (interval '1 millisecond' * total_exec_time)::text AS total_exec_time,
  to_char((total_exec_time/sum(total_exec_time) OVER()) * 100, 'FM90D0') || '%'  AS prop_exec_time,
  to_char(calls, 'FM999G999G999G990') AS ncalls,
  /*
    Handle column names for 15 and 17
  */
  (
    interval '1 millisecond' * (
      COALESCE(
        (to_jsonb(s) ->> 'shared_blk_read_time')::double precision,
        (to_jsonb(s) ->> 'blk_read_time')::double precision,
        0
      )
      +
      COALESCE(
        (to_jsonb(s) ->> 'shared_blk_write_time')::double precision,
        (to_jsonb(s) ->> 'blk_write_time')::double precision,
        0
      )
    )
  )::text AS sync_io_time,
  query
FROM extensions.pg_stat_statements s WHERE userid = (SELECT usesysid FROM pg_user WHERE usename = current_user LIMIT 1)
ORDER BY total_exec_time DESC
LIMIT 10
```

### `calls`

```sql
SELECT
  query,
  (interval '1 millisecond' * total_exec_time)::text AS total_exec_time,
  to_char((total_exec_time/sum(total_exec_time) OVER()) * 100, 'FM90D0') || '%'  AS prop_exec_time,
  to_char(calls, 'FM999G999G999G999G990') AS ncalls,
  /*
    Handle column names for 15 and 17
  */
  (
    interval '1 millisecond' * (
      COALESCE(
        (to_jsonb(s) ->> 'shared_blk_read_time')::double precision,
        (to_jsonb(s) ->> 'blk_read_time')::double precision,
        0
      )
      +
      COALESCE(
        (to_jsonb(s) ->> 'shared_blk_write_time')::double precision,
        (to_jsonb(s) ->> 'blk_write_time')::double precision,
        0
      )
    )
  )::text AS sync_io_time
FROM extensions.pg_stat_statements s
ORDER BY calls DESC
LIMIT 10
```

### `index-stats`

```sql
-- Combined index statistics: size, usage percent, seq scans, mark unused, expose table + columns
WITH idx_sizes AS (
  SELECT
    i.indexrelid AS oid,
    FORMAT('%I.%I', n.nspname, c.relname) AS name,
    FORMAT('%I.%I', tn.nspname, tc.relname) AS table_name,
    (
      SELECT STRING_AGG(pg_get_indexdef(i.indexrelid, ord::int, false), ',' ORDER BY ord)
      FROM unnest(i.indkey::int[]) WITH ORDINALITY AS k(attnum, ord)
    ) AS columns,
    pg_relation_size(i.indexrelid) AS index_size_bytes
  FROM pg_stat_user_indexes ui
  JOIN pg_index i ON ui.indexrelid = i.indexrelid
  JOIN pg_class c ON ui.indexrelid = c.oid
  JOIN pg_namespace n ON c.relnamespace = n.oid
  JOIN pg_class tc ON tc.oid = i.indrelid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE NOT n.nspname LIKE ANY($1)
),
idx_usage AS (
  SELECT
    indexrelid AS oid,
    idx_scan::bigint AS idx_scans
  FROM pg_stat_user_indexes ui
  WHERE NOT schemaname LIKE ANY($1)
),
seq_usage AS (
  SELECT
    relid AS oid,
    seq_scan::bigint AS seq_scans
  FROM pg_stat_user_tables
  WHERE NOT schemaname LIKE ANY($1)
),
usage_pct AS (
  SELECT
    u.oid,
    CASE
      WHEN u.idx_scans IS NULL OR u.idx_scans = 0 THEN 0
      WHEN s.seq_scans IS NULL THEN 100
      ELSE ROUND(100.0 * u.idx_scans / (s.seq_scans + u.idx_scans), 1)
    END AS percent_used
  FROM idx_usage u
  LEFT JOIN seq_usage s ON s.oid = u.oid
)
SELECT
  s.name,
  s.table_name AS "table",
  s.columns,
  pg_size_pretty(s.index_size_bytes) AS size,
  COALESCE(up.percent_used, 0)::text || '%' AS percent_used,
  COALESCE(u.idx_scans, 0) AS index_scans,
  COALESCE(sq.seq_scans, 0) AS seq_scans,
  CASE WHEN COALESCE(u.idx_scans, 0) = 0 THEN true ELSE false END AS unused
FROM idx_sizes s
LEFT JOIN idx_usage u ON u.oid = s.oid
LEFT JOIN seq_usage sq ON sq.oid = s.oid
LEFT JOIN usage_pct up ON up.oid = s.oid
ORDER BY s.index_size_bytes DESC
```

### `long-running-queries`

```sql
SELECT
  pid,
  age(now(), pg_stat_activity.query_start)::text AS duration,
  query AS query
FROM
  pg_stat_activity
WHERE
  pg_stat_activity.query <> ''::text
  AND state <> 'idle'
  AND age(now(), pg_stat_activity.query_start) > interval '5 minutes'
ORDER BY
  age(now(), pg_stat_activity.query_start) DESC
```

### `bloat`

```sql
WITH constants AS (
  SELECT current_setting('block_size')::numeric AS bs, 23 AS hdr, 4 AS ma
), bloat_info AS (
  SELECT
    ma,bs,schemaname,tablename,
    (datawidth+(hdr+ma-(case when hdr%ma=0 THEN ma ELSE hdr%ma END)))::numeric AS datahdr,
    (maxfracsum*(nullhdr+ma-(case when nullhdr%ma=0 THEN ma ELSE nullhdr%ma END))) AS nullhdr2
  FROM (
    SELECT
      schemaname, tablename, hdr, ma, bs,
      SUM((1-null_frac)*avg_width) AS datawidth,
      MAX(null_frac) AS maxfracsum,
      hdr+(
        SELECT 1+count(*)/8
        FROM pg_stats s2
        WHERE null_frac<>0 AND s2.schemaname = s.schemaname AND s2.tablename = s.tablename
      ) AS nullhdr
    FROM pg_stats s, constants
    GROUP BY 1,2,3,4,5
  ) AS foo
), table_bloat AS (
  SELECT
    schemaname, tablename, cc.relpages, bs,
    CEIL((cc.reltuples*((datahdr+ma-
      (CASE WHEN datahdr%ma=0 THEN ma ELSE datahdr%ma END))+nullhdr2+4))/(bs-20::float)) AS otta
  FROM bloat_info
  JOIN pg_class cc ON cc.relname = bloat_info.tablename
  JOIN pg_namespace nn ON cc.relnamespace = nn.oid AND nn.nspname = bloat_info.schemaname
  WHERE NOT nn.nspname LIKE ANY($1)
), index_bloat AS (
  SELECT
    schemaname, tablename, bs,
    COALESCE(c2.relname,'?') AS iname, COALESCE(c2.reltuples,0) AS ituples, COALESCE(c2.relpages,0) AS ipages,
    COALESCE(CEIL((c2.reltuples*(datahdr-12))/(bs-20::float)),0) AS iotta -- very rough approximation, assumes all cols
  FROM bloat_info
  JOIN pg_class cc ON cc.relname = bloat_info.tablename
  JOIN pg_namespace nn ON cc.relnamespace = nn.oid AND nn.nspname = bloat_info.schemaname
  JOIN pg_index i ON indrelid = cc.oid
  JOIN pg_class c2 ON c2.oid = i.indexrelid
  WHERE NOT nn.nspname LIKE ANY($1)
), bloat_summary AS (
  SELECT
    'table' as type,
    FORMAT('%I.%I', schemaname, tablename) AS name,
    ROUND(CASE WHEN otta=0 THEN 0.0 ELSE table_bloat.relpages/otta::numeric END,1) AS bloat,
    CASE WHEN relpages < otta THEN '0' ELSE (bs*(table_bloat.relpages-otta)::bigint)::bigint END AS raw_waste
  FROM table_bloat
    UNION
  SELECT
    'index' as type,
    FORMAT('%I.%I::%I', schemaname, tablename, iname) AS name,
    ROUND(CASE WHEN iotta=0 OR ipages=0 THEN 0.0 ELSE ipages/iotta::numeric END,1) AS bloat,
  CASE WHEN ipages < iotta THEN '0' ELSE (bs*(ipages-iotta))::bigint END AS raw_waste
  FROM index_bloat
)
SELECT type, name, bloat, pg_size_pretty(raw_waste) as waste
FROM bloat_summary
ORDER BY raw_waste DESC, bloat DESC
```

### `role-stats`

```sql
SELECT
  rolname as role_name,
  (
    SELECT
      count(*)
    FROM
      pg_stat_activity
    WHERE
      pg_roles.rolname = pg_stat_activity.usename
  ) AS active_connections,
  CASE WHEN rolconnlimit = -1
    THEN current_setting('max_connections')::int8
    ELSE rolconnlimit
  END AS connection_limit,
  array_to_string(rolconfig, ',', '*') as custom_config
FROM
  pg_roles
ORDER BY 1 DESC
```

### `vacuum-stats`

```sql
WITH table_opts AS (
  SELECT
    pg_class.oid, relname, nspname, array_to_string(reloptions, '') AS relopts
  FROM
    pg_class INNER JOIN pg_namespace ns ON relnamespace = ns.oid
), vacuum_settings AS (
  SELECT
    oid, relname, nspname,
    CASE
      WHEN relopts LIKE '%autovacuum_vacuum_threshold%'
        THEN substring(relopts, '.*autovacuum_vacuum_threshold=([0-9.]+).*')::integer
        ELSE current_setting('autovacuum_vacuum_threshold')::integer
      END AS autovacuum_vacuum_threshold,
    CASE
      WHEN relopts LIKE '%autovacuum_vacuum_scale_factor%'
        THEN substring(relopts, '.*autovacuum_vacuum_scale_factor=([0-9.]+).*')::real
        ELSE current_setting('autovacuum_vacuum_scale_factor')::real
      END AS autovacuum_vacuum_scale_factor,
    CASE
      WHEN relopts LIKE '%autovacuum_analyze_threshold%'
        THEN substring(relopts, '.*autovacuum_analyze_threshold=([0-9.]+).*')::integer
        ELSE current_setting('autovacuum_analyze_threshold')::integer
      END AS autovacuum_analyze_threshold,
    CASE
      WHEN relopts LIKE '%autovacuum_analyze_scale_factor%'
        THEN substring(relopts, '.*autovacuum_analyze_scale_factor=([0-9.]+).*')::real
        ELSE current_setting('autovacuum_analyze_scale_factor')::real
      END AS autovacuum_analyze_scale_factor
  FROM
    table_opts
)
SELECT
  FORMAT('%I.%I', vacuum_settings.nspname, vacuum_settings.relname) AS name,
  coalesce(to_char(psut.last_vacuum, 'YYYY-MM-DD HH24:MI'), '') AS last_vacuum,
  coalesce(to_char(psut.last_autovacuum, 'YYYY-MM-DD HH24:MI'), '') AS last_autovacuum,
  coalesce(to_char(psut.last_analyze, 'YYYY-MM-DD HH24:MI'), '') AS last_analyze,
  coalesce(to_char(psut.last_autoanalyze, 'YYYY-MM-DD HH24:MI'), '') AS last_autoanalyze,
  to_char(pg_class.reltuples, '9G999G999G999') AS rowcount,
  to_char(psut.n_dead_tup, '9G999G999G999') AS dead_rowcount,
  to_char(autovacuum_vacuum_threshold
       + (autovacuum_vacuum_scale_factor::numeric * pg_class.reltuples), '9G999G999G999') AS autovacuum_threshold,
  CASE
    WHEN autovacuum_vacuum_threshold + (autovacuum_vacuum_scale_factor::numeric * pg_class.reltuples) < psut.n_dead_tup
    THEN 'yes'
    ELSE 'no'
  END AS expect_autovacuum,
  to_char(autovacuum_analyze_threshold
       + (autovacuum_analyze_scale_factor::numeric * pg_class.reltuples), '9G999G999G999') AS autoanalyze_threshold,
  CASE
    WHEN autovacuum_analyze_threshold + (autovacuum_analyze_scale_factor::numeric * pg_class.reltuples) < psut.n_dead_tup
    THEN 'yes'
    ELSE 'no'
  END AS expect_autoanalyze
FROM
  pg_stat_user_tables psut INNER JOIN pg_class ON psut.relid = pg_class.oid
INNER JOIN vacuum_settings ON pg_class.oid = vacuum_settings.oid
WHERE NOT vacuum_settings.nspname LIKE ANY($1)
ORDER BY
  case
    when pg_class.reltuples = -1 then 1
    else 0
  end,
  1
```

### `table-stats`

```sql
SELECT
  ts.name,
  pg_size_pretty(ts.table_size_bytes) AS table_size,
  pg_size_pretty(ts.index_size_bytes) AS index_size,
  pg_size_pretty(ts.total_size_bytes) AS total_size,
  COALESCE(rc.estimated_row_count, 0) AS estimated_row_count,
  COALESCE(rc.seq_scans, 0) AS seq_scans
FROM (
  SELECT
    FORMAT('%I.%I', n.nspname, c.relname) AS name,
    pg_table_size(c.oid) AS table_size_bytes,
    pg_indexes_size(c.oid) AS index_size_bytes,
    pg_total_relation_size(c.oid) AS total_size_bytes
  FROM pg_class c
  LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE NOT n.nspname LIKE ANY($1)
    AND c.relkind = 'r'
) ts
LEFT JOIN (
  SELECT
    FORMAT('%I.%I', schemaname, relname) AS name,
    n_live_tup AS estimated_row_count,
    seq_scan AS seq_scans
  FROM pg_stat_user_tables
  WHERE NOT schemaname LIKE ANY($1)
) rc ON rc.name = ts.name
ORDER BY ts.total_size_bytes DESC
```

### `traffic-profile`

```sql
 -- Query adapted from Crunchy Data blog: "Is Postgres Read Heavy or Write Heavy? (And Why You Should Care)" by David Christensen
WITH
ratio_target AS (SELECT 5 AS ratio),
table_list AS (SELECT
 s.schemaname,
 s.relname AS table_name,
 si.heap_blks_read + si.idx_blks_read AS blocks_read,
s.n_tup_ins + s.n_tup_upd + s.n_tup_del AS write_tuples,
relpages * (s.n_tup_ins + s.n_tup_upd + s.n_tup_del ) / (case when reltuples = 0 then 1 else reltuples end) as blocks_write
FROM
 pg_stat_user_tables AS s
JOIN pg_statio_user_tables AS si ON s.relid = si.relid
JOIN pg_class c ON c.oid = s.relid
WHERE
(s.n_tup_ins + s.n_tup_upd + s.n_tup_del) > 0
AND
 (si.heap_blks_read + si.idx_blks_read) > 0
 )
SELECT
  schemaname,
  table_name,
  blocks_read,
  write_tuples,
  blocks_write,
  CASE
    WHEN blocks_read = 0 and blocks_write = 0 THEN
      'No Activity'
    WHEN blocks_write * ratio > blocks_read THEN
      CASE
        WHEN blocks_read = 0 THEN 'Write-Only'
        ELSE
          ROUND(blocks_write :: numeric / blocks_read :: numeric, 1)::text || ':1 (Write-Heavy)'
      END
    WHEN blocks_read > blocks_write * ratio THEN
      CASE
        WHEN blocks_write = 0 THEN 'Read-Only'
        ELSE
          '1:' || ROUND(blocks_read::numeric / blocks_write :: numeric, 1)::text || ' (Read-Heavy)'
      END
    ELSE
      '1:1 (Balanced)'
  END AS activity_ratio
FROM table_list, ratio_target
ORDER BY
 (blocks_read + blocks_write) DESC
```

