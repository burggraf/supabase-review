import { parseArgs } from "node:util";

export type Command = "run" | "collect" | "report" | "self-test";
export interface CliArgs {
  command: Command;
  evidencePath?: string;
  output?: string;
  projectRef?: string;
  days: number;
  withLogs: boolean;
  withLlm: boolean;
  llmCommand?: string;
  skipLlmValidation: boolean;
  noRedact: boolean;
  nonInteractive: boolean;
  help: boolean;
  version: boolean;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const first = argv[0];
  const command: Command = first === "run" || first === "collect" || first === "report" || first === "self-test" ? first : "run";
  const rest = first === command ? argv.slice(1) : argv;
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      output: { type: "string" },
      "project-ref": { type: "string" },
      days: { type: "string" },
      "with-logs": { type: "boolean" },
      "with-llm": { type: "boolean" },
      "llm-command": { type: "string" },
      "skip-llm-validation": { type: "boolean" },
      "no-redact": { type: "boolean" },
      "non-interactive": { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
    allowPositionals: true,
    strict: true,
  });
  const days = values.days === undefined ? 7 : Number(values.days);
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error("--days must be an integer from 1 to 90");
  if (command === "report" && positionals.length !== 1) throw new Error("report requires an evidence.json path");
  if (command !== "report" && positionals.length) throw new Error(`unexpected argument: ${positionals[0]}`);
  return {
    command,
    ...(command === "report" && positionals[0] ? { evidencePath: positionals[0] } : {}),
    ...(typeof values.output === "string" ? { output: values.output } : {}),
    ...(typeof values["project-ref"] === "string" ? { projectRef: values["project-ref"] } : {}),
    days,
    withLogs: values["with-logs"] === true,
    withLlm: values["with-llm"] === true,
    ...(typeof values["llm-command"] === "string" ? { llmCommand: values["llm-command"] } : {}),
    skipLlmValidation: values["skip-llm-validation"] === true,
    noRedact: values["no-redact"] === true,
    nonInteractive: values["non-interactive"] === true,
    help: values.help === true,
    version: values.version === true,
  };
}
