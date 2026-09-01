import { access } from "node:fs/promises";
import { join } from "node:path";

type Runner = (args: string[], options: { cwd: string; env: Record<string, string> }) => Promise<number>;
type HasNpx = () => Promise<boolean>;

const defaultHasNpx: HasNpx = async () => Boolean(Bun.which("npx"));
const defaultRunner: Runner = async (args, options) => {
  const child = Bun.spawn(["npx", ...args], { cwd: options.cwd, env: options.env, stdin: "ignore", stdout: "ignore", stderr: "ignore" });
  return child.exited;
};

export async function createPdfs(directory: string, runner: Runner = defaultRunner, hasNpx: HasNpx = defaultHasNpx): Promise<string> {
  if (!(await hasNpx())) return "npx was not found; PDFs were not created. Install Node.js/npm, then run npx md-to-pdf to create them.";
  for (const markdown of ["report.md", "executive-summary.md"]) {
    const code = await runner(["--yes", "md-to-pdf", markdown], { cwd: directory, env: { ...process.env as Record<string, string>, CI: "1", NPM_CONFIG_YES: "true" } });
    if (code !== 0) return `npx md-to-pdf failed while converting ${markdown}; Markdown files were kept and PDFs were not created.`;
  }
  const missing = [];
  for (const pdf of ["report.pdf", "executive-summary.pdf"]) { try { await access(join(directory, pdf)); } catch { missing.push(pdf); } }
  return missing.length ? `npx md-to-pdf completed but did not create ${missing.join(" and ")}.` : "PDFs created with npx md-to-pdf.";
}
