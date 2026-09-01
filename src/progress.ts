const labels: Record<string, string> = {
  database: "Collecting database evidence",
  logs: "Collecting hosted logs",
  validation: "Validating LLM command",
  detailed: "Generating detailed report",
  executive: "Generating executive summary",
};

export function formatProgress(step: string, estimate: string): string {
  const order = ["database", "logs", "validation", "detailed", "executive"];
  const number = order.indexOf(step) + 1;
  return `[${number}/5] ${labels[step] ?? step} — ${estimate}.`;
}

export function progress(step: string, estimate: string): void {
  console.error(formatProgress(step, estimate));
}
