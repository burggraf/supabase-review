# Research: standalone Supabase performance review tool

**Date:** 2026-09-01  
**Scope:** `inspect.sh --review`, its database inspection commands, its Logflare slow-log lookup, and its Claude report generation. No implementation changes are proposed in this document.

## Executive recommendation

Build this as a **local, developer-run CLI first**, not as a hosted SaaS.

1. Run only the 13 current, non-deprecated `supabase inspect db` checks.
2. Replace the private-looking `Success.ProjectLogs` Logflare call with Supabase's supported Management API `GET /v1/projects/{ref}/analytics/endpoints/logs` endpoint.
3. Use a Supabase Personal Access Token (PAT) for the MVP; add Supabase OAuth with `analytics:read` if the tool later becomes a polished third-party integration.
4. Use the developer's Anthropic API key directly instead of requiring the Claude Code CLI. Support one LLM initially; add another only when users ask for it.
5. Keep credentials and collected project data local. Write normalized evidence as JSON, then generate Markdown reports. Make PDF an optional browser/print export rather than a core dependency.
6. Do not keep or document `LOGFLARE_KEY` as a consumer credential. Ordinary Supabase users should not need a Logflare account for this tool.

This preserves the useful Logflare-backed Supabase logs, but accesses them through the public Supabase API rather than through an internal/shared Logflare endpoint.

## 1. Can normal Supabase users access Logflare?

### Short answer

- **Logflare itself is publicly available:** anyone can create a Logflare account, ingest their own logs, create their own endpoints, and create access tokens.
- **That does not grant access to Supabase's hosted project logs.** Logflare access tokens query sources/endpoints belonging to the token's Logflare account and may be scoped to particular endpoints.
- The current script calls the named endpoint `Success.ProjectLogs` at `query.logflare.app`. That endpoint is not created in this repository, is not documented as a customer Supabase endpoint, and appears to belong to a shared/internal Logflare account. A normal user's newly-created Logflare query token would not grant access to it.
- Therefore, **the exact current Logflare step should not be carried into a consumer app**.

This conclusion is based on Logflare's documented account/token model and the absence of any Supabase documentation granting customers access to `Success.ProjectLogs`. It should be confirmed once with a non-employee Logflare account before removing the old path, but it is not a suitable public product dependency either way.

### Supported consumer access to Supabase logs

Supabase project owners can query their own logs through the **Supabase Management API**:

```text
GET /v1/projects/{ref}/analytics/endpoints/logs
```

The endpoint:

- accepts ClickHouse SQL or LQL over the project's unified log stream;
- requires `analytics:read` for OAuth or `analytics_logs_read` for a fine-grained token;
- accepts a Supabase PAT through the normal Management API `Authorization: Bearer ...` header;
- limits each query to a maximum 24-hour range;
- defaults to only the previous minute if a complete range is not supplied;
- exposes sources such as `postgres_logs`, `edge_logs`, `auth_logs`, and function logs.

The old Management API endpoint, `logs.all`, is scheduled for removal on **2026-09-23**. A new app should use `/analytics/endpoints/logs` and ClickHouse syntax from day one.

There is a small documentation inconsistency: the current API/logging reference says to filter the unified table using `source`, while the migration changelog uses `source_name`. Confirm the accepted column in a prototype against a real project instead of hard-coding from the changelog alone.

### Limits that affect the current 10-day lookup

A consumer app cannot make the current 10-day request as one API call:

- split the requested period into windows of at most 24 hours;
- query only `postgres_logs` and filter for slow-query/`duration:` messages early;
- enforce a row limit and retain the exact time range actually searched;
- handle `429` with the returned rate-limit headers;
- warn that log querying scans billable data.

Log retention currently varies by plan:

| Plan | API/database log retention |
|---|---:|
| Free | 1 day |
| Pro | 7 days |
| Team | 28 days |
| Enterprise | 90 days |

The app should default to `min(7 days, available retention)` when it can determine the plan, or clearly report the requested and observed range when it cannot. Ten days is a poor universal default because it exceeds Free and Pro retention.

Slow-query logs must remain **optional enrichment**. They may be absent because retention expired or because the relevant Postgres logging/`auto_explain` output was not enabled. `pg_stat_statements` results from `outliers` and `calls` are the primary workload evidence.

### Why not ask users to connect their own Logflare account?

That would only help if they first drained or ingested their Supabase logs into that account. Supabase Log Drains are a paid, continuously-running observability feature and are not available on the Free plan. They are useful for long retention or continuous monitoring, but are unnecessary and expensive for an on-demand report. Treat drains as a future advanced input, not the default path.

## 2. Can the database and LLM work be extracted easily?

### Database checks: yes

The installed Supabase CLI v2.115.0 reports 13 active inspection commands. Each active command executes one read-only PostgreSQL `SELECT`. The SQL is present in the MIT-licensed Supabase CLI source, and the newer CLI can emit machine-readable JSON.

For a quick prototype, call a pinned Supabase CLI and request JSON. For a product-quality standalone tool, copy the 13 SQL queries into a small, versioned query registry and execute them through a PostgreSQL driver. Direct execution avoids:

- requiring a separately-installed CLI;
- passing the database password in a subprocess argument/process list;
- parsing changing human-readable table output;
- misleading file extensions and output formats.

Keep each query isolated with a statement timeout. A failed or unauthorized check should be recorded as unavailable while the remaining checks continue. Some statistics/functions require privileges that a restricted database role may not have.

Set an application name and avoid recording the tool's own inspection queries in `pg_stat_statements` where possible, preserving the intent of the repository's `PGOPTIONS="-c pg_stat_statements.track=none"` setting.

### LLM report: yes

The current `--review` path is already cleanly separated: it writes a prompt, runs Claude over the collected files, splits two Markdown documents, and optionally renders PDFs.

For a standalone app:

- call the Anthropic API directly using the developer's `ANTHROPIC_API_KEY`;
- pass one normalized evidence JSON document rather than a directory of ambiguously-formatted CSV files;
- request structured output with two named Markdown sections;
- save raw evidence, model/provider/version, tool version, successful checks, failed checks, and the exact observation period with the report;
- never auto-execute index, vacuum, configuration, or architecture recommendations;
- show users which project data will be sent to the LLM before submission.

Do not build a generic provider abstraction initially. Anthropic matches the current workflow. Add OpenAI or an OpenAI-compatible endpoint only after a real requirement appears.

## 3. Query cleanup required now

`inspect.sh` currently runs all 13 active commands **and 12 deprecated aliases**. In current Supabase CLI source, the aliases route to consolidated active queries:

| Deprecated command(s) | Query actually used |
|---|---|
| `cache-hit` | `db-stats` |
| `index-usage`, `total-index-size`, `index-sizes`, `unused-indexes`, `seq-scans` | `index-stats` |
| `table-record-counts` | currently routes to `index-stats`, despite warning to use `table-stats` |
| `table-sizes`, `table-index-sizes`, `total-table-sizes` | `table-stats` |
| `role-configs`, `role-connections` | `role-stats` |

The deprecated calls add no evidence, increase database work, create duplicate files, and can bias the LLM by repeating the same findings. `table-record-counts` is especially misleading because of the preserved CLI routing inconsistency.

Keep only:

```text
db-stats
replication-slots
locks
blocking
outliers
calls
index-stats
long-running-queries
bloat
role-stats
vacuum-stats
table-stats
traffic-profile
```

The active commands still have useful overlap rather than exact duplication:

- `outliers` and `calls` rank `pg_stat_statements` from different workload perspectives;
- `locks`, `blocking`, and `long-running-queries` capture different transient states;
- `db-stats`, `index-stats`, and `table-stats` are the intended consolidated replacements.

A second cleanup issue is output format. The current loop names files `*.csv` but does not explicitly request CSV. In the inspected current CLI, default output is a human-readable table and machine output is available through `--output-format json`. The standalone format should be JSON, regardless of whether the prototype shells out or runs SQL directly.

The existing `scripts/slow-queries-to-csv.py` should not be moved unchanged. It installs `tqdm` at runtime, assumes every matching event contains an `auto_explain` plan, and performs quadratic pairwise string similarity. The standalone collector should use a small tolerant parser, preserve unparsable events, and prefer PostgreSQL `queryid`/normalized query data from `pg_stat_statements` for grouping.

## 4. Recommended product shape

### Recommended: local CLI with an interactive wizard

A developer audience already has a terminal, and a local process is the safest place to handle a database password, Supabase token, logs, SQL text, and LLM key.

Suggested flow:

1. Ask for or read the database URL.
2. Derive the project ref when possible, but allow an explicit override for pooler/custom URLs.
3. Run 13 read-only checks independently and show progress.
4. Optionally ask for a Supabase PAT and fetch logs through the Management API in 24-hour windows.
5. Show a collection summary and what will be sent to the LLM.
6. Optionally ask for/read `ANTHROPIC_API_KEY` and generate reports.
7. Write:
   - `evidence.json`
   - `report.md`
   - `executive-summary.md`
   - a small manifest with versions, ranges, failures, and redaction choices
8. Let users print Markdown/HTML to PDF if needed.

Credentials should be accepted through environment variables or a masked prompt, never written to the report directory, never echoed, and never included in telemetry. Telemetry should be off by default.

### Authentication progression

**MVP:** PAT supplied locally. This is easy but the PAT carries the same privileges as the user, so explain that it is sensitive and do not persist it.

**Polished third-party app:** Supabase OAuth with PKCE and the narrow `analytics:read` scope. This gives a better "Connect Supabase" experience and avoids asking users to paste a broad PAT. The database password is still separate; Supabase's Management API cannot retrieve an existing project's database password.

### Packaging progression

1. **Prototype:** small Node/TypeScript CLI that shells out to a pinned Supabase CLI in JSON mode.
2. **Product version:** execute the 13 reviewed SQL queries with a PostgreSQL driver; retain attribution/source links and compatibility tests against supported Postgres/Supabase versions.
3. **Only if users want it:** add a local web/desktop UI around the same collector. Do not start with a hosted service or desktop framework.

A hosted service would force the product to receive and protect database credentials, Supabase access tokens, SQL/log data, and LLM keys. That creates substantially more security and compliance work without improving the core report.

## 5. Minimal release plan

### Phase 0: clean and prove the existing workflow

- Remove the 12 deprecated commands.
- Standardize evidence on JSON.
- Swap the direct Logflare request for the new Supabase Management API logs endpoint.
- Chunk log queries to 24 hours and default to a shorter retention-aware period.
- Make log and LLM collection independently optional.

### Phase 1: extract a standalone CLI

- Local interactive command plus non-interactive environment-variable mode.
- Database collector, optional Supabase logs collector, evidence manifest, and Anthropic report generation.
- Partial-failure behavior and explicit secret redaction.
- Markdown output; no required PDF engine.

### Phase 2: improve onboarding only after validation

- Supabase OAuth/PKCE with `analytics:read`.
- Project picker and safer database connection form.
- Optional local browser UI and print-to-PDF.
- Add a second LLM provider only if demand is demonstrated.

## 6. Acceptance criteria for an effective tool

- Runs on a normal customer's hosted Supabase project without employee credentials.
- Produces a useful database-only report when logs or LLM credentials are absent.
- Never calls `Success.ProjectLogs` or `logs.all`.
- Runs each active database query once.
- Clearly distinguishes observed facts, unavailable checks, and LLM recommendations.
- States the statistics reset time and log observation window so findings are not presented without context.
- Does not persist or print secrets.
- Does not execute remediation SQL.
- Saves enough normalized evidence to regenerate a report without reconnecting to the database.

## Sources

### Repository/local inspection

- `inspect.sh`, especially the active/deprecated command list and `Success.ProjectLogs` request.
- `scripts/slow-queries-to-csv.py`.
- Supabase CLI v2.115.0 local help: `supabase inspect db --help` and per-command help.
- Supabase CLI source and consolidation commit: <https://github.com/supabase/cli/commit/9b3cb172d44566cd2ffaa54aefe727dd67d39eef>
- Supabase CLI repository/license: <https://github.com/supabase/cli>

### Supabase

- Management API authentication and rate limits: <https://supabase.com/docs/reference/api/introduction>
- Current project logs endpoint: <https://supabase.com/docs/reference/api/v1-get-project-logs>
- Deprecated `logs.all` endpoint: <https://supabase.com/docs/reference/api/v1-get-project-logs-all>
- `logs.all` migration/removal notice: <https://supabase.com/changelog/48235-migration-of-supabase-management-api-logs-all-analytics-endpoint-to-logs-endpoint>
- Logs and ClickHouse query model: <https://supabase.com/docs/guides/monitoring-and-debugging/logs>
- Logs query usage/billing: <https://supabase.com/docs/guides/platform/manage-your-usage/logs-query>
- Database inspection: <https://supabase.com/docs/guides/database/inspect>
- Supabase OAuth integration guide: <https://supabase.com/docs/guides/integrations/build-a-supabase-integration>
- Pricing/log retention: <https://supabase.com/pricing>
- Log Drains: <https://supabase.com/docs/guides/monitoring-and-debugging/log-drains>

### Logflare

- Endpoint ownership/authentication model: <https://docs.logflare.app/concepts/endpoints/>
- Access-token scopes: <https://docs.logflare.app/concepts/access-tokens/>
