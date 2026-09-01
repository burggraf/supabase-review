# Security

## Trust boundaries

The CLI reads a PostgreSQL URI from the environment or a masked interactive prompt and executes only its embedded static inspection queries. It sends no telemetry. Hosted logs are fetched only after `--with-logs` and require a project ref and access token. External report generation is a separate boundary: selected redacted evidence is sent to a command supplied by the user.

`--llm-command` executes arbitrary local shell code with the current user's permissions. Use only a command you personally typed and trust. Keep provider credentials in that provider's normal auth store or environment, and prefer read-only/no-tool flags where available. Project or evidence content can never set, modify, or interpolate the command.

## Credential handling

Database URLs, passwords, access tokens, and PostgreSQL environment variables are excluded from child LLM environments and evidence. Secret values are not command-line flags because process listings expose arguments. The full LLM command is not persisted in analysis metadata; `analysis.json` stores only its SHA-256 fingerprint. Prompts are sent over stdin. The guided workflow offers an explicit opt-in to save values in `~/.config/supabase-review/config.env`, creates the directory with mode 0700 and the file with mode 0600, and never saves them without consent. Decline that prompt to keep credentials prompt-only.

Evidence is untrusted prompt content. The report prompt tells the model not to follow instructions in SQL or log text. Redaction covers common PostgreSQL URLs, JWTs, `sbp_` tokens, common API-key prefixes, email addresses, and IP addresses, but heuristic redaction is not guaranteed to remove all sensitive or personal data. Review evidence before using an external command; `--no-redact` is not supported for non-interactive use.

Database checks use TLS settings supplied by the URI, per-check read-only transactions, and local statement timeouts. No recommendation or SQL produced by an LLM is executed.

## Reporting vulnerabilities

Do not disclose credentials or sensitive project data in an issue. Report security vulnerabilities privately to the repository maintainers and include the affected version, reproduction steps without secrets, and impact. Supported versions are the latest release and the immediately preceding release; update promptly when a security fix is available.

## Data and privacy

Collection stays local unless you explicitly enable hosted logs or report generation. The selected evidence subset is sent only to the user-configured command. There is no telemetry. The project does not request, manage, or persist LLM credentials.
