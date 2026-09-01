import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export const targets = [
  ["darwin-x64", "bun-darwin-x64"],
  ["darwin-arm64", "bun-darwin-arm64"],
  ["linux-x64", "bun-linux-x64-musl"],
  ["linux-arm64", "bun-linux-arm64-musl"],
  ["windows-x64", "bun-windows-x64"],
  ["windows-arm64", "bun-windows-arm64"],
] as const;

const packageJson = await Bun.file("package.json").json() as { version: string };

export async function buildTarget(name: typeof targets[number][0]): Promise<string> {
  const entry = targets.find(([label]) => label === name);
  if (!entry) throw new Error(`Unknown target: ${name}`);
  const outfile = join("dist", `supabase-review-${name}${name.startsWith("windows-") ? ".exe" : ""}`);
  await mkdir("dist", { recursive: true });
  const result = await Bun.build({
    entrypoints: ["src/cli.ts"],
    compile: { target: entry[1], outfile, autoloadDotenv: false, autoloadBunfig: false, autoloadPackageJson: false },
    minify: true,
    define: { __VERSION__: JSON.stringify(packageJson.version) },
  });
  if (!result.success || !(await Bun.file(outfile).exists()) || (await Bun.file(outfile).size) === 0) throw new Error(`Build failed for ${name}`);
  return outfile;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const requested = args.includes("--all") ? targets.map(([name]) => name) : [args[args.indexOf("--target") + 1] ?? targets.find(([_, target]) => target === `bun-${process.platform}-${process.arch}`)?.[0] ?? "darwin-arm64"];
  for (const name of requested) console.log(await buildTarget(name as typeof targets[number][0]));
}
