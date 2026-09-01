# Supabase Performance Review

A local, read-only CLI that collects PostgreSQL/Supabase performance evidence and renders a deterministic facts report. It does not execute remediation, run user SQL, or send data anywhere unless you explicitly enable logs or an external report command.

## Downloads

Release archives are published for **darwin-x64**, **darwin-arm64**, **linux-x64**, **linux-arm64**, **windows-x64**, and **windows-arm64**. Beta binaries may be unsigned. Verify checksums:

```bash
shasum -a 256 -c SHA256SUMS
```

Windows PowerShell:

```powershell
(Get-FileHash .\supabase-review.exe -Algorithm SHA256).Hash
```

## Quick start

Interactive mode masks database and Supabase secrets:

```bash
supabase-review collect
```

Non-interactive database-only collection:

```bash
DATABASE_URL='postgresql://user:password@host/db' \
  supabase-review collect --non-interactive --output ./review
```

Environment inputs are `DATABASE_URL`, optional `SUPABASE_PROJECT_REF`, optional `SUPABASE_ACCESS_TOKEN` (only for `--with-logs`), and optional `SUPABASE_REVIEW_LLM_COMMAND`. Credentials are never command-line flags, persisted, or included in evidence.

Hosted logs are explicit and may incur billable Logs Query usage; retention and plan availability apply:

```bash
DATABASE_URL='...' SUPABASE_PROJECT_REF='ref' SUPABASE_ACCESS_TOKEN='...' \
  supabase-review collect --with-logs --days 7 --non-interactive
```

A report can be regenerated offline from existing evidence:

```bash
supabase-review report ./review/evidence.json --llm-command 'pi-high.sh' --non-interactive
```

## External report commands

The command must read the complete prompt from standard input and write its final Markdown answer to standard output. The tool runs it as the current user, in an empty temporary directory, with database credentials removed from its environment. It never asks for LLM credentials; authenticate the provider CLI separately.

Examples (verify syntax with your installed CLI's `--help`):

```text
claude -p --tools "" --permission-mode plan --output-format text
codex exec --sandbox read-only --ephemeral --skip-git-repo-check -
gemini -p "" --approval-mode plan --output-format text
```

Validation runs by default with a harmless `SUPABASE_REVIEW_READY` prompt. Use `--skip-llm-validation` only when explicitly needed. Child execution has a 10-minute report timeout, 10 MiB stdout limit, and bounded stderr diagnostics. `--no-redact` is intentionally discouraged; heuristic redaction is not complete.

`run` requires `--with-llm` for external reports. `collect` never invokes one. `report` is explicit consent. Reports contain observations and recommendations but never execute remediation.

## Outputs and limitations

Each collection writes `evidence.json` and `facts.md`; successful external reporting additionally writes `analysis.json`, `report.md`, and `executive-summary.md`. Partial database checks remain in evidence. Optional log failures produce warnings without discarding database evidence. The facts document contains observed facts, not remediation advice.

Troubleshooting: percent-encode URI passwords; use the URI's TLS settings rather than downgrading SSL; direct hosts infer project refs from `db.<ref>.supabase.co`; poolers infer from `postgres.<ref>`; otherwise set `SUPABASE_PROJECT_REF`. Missing `pg_stat_statements` affects only dependent checks. Logs errors such as 401, 403, 402, 429, unavailable retention, or permission failures are reported as optional warnings.

There is no telemetry, hosted service, PDF output, automatic updater, or automatic remediation.
