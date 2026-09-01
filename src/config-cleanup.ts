import { access, rm } from "node:fs/promises";
import { promptConfirm } from "./prompts";

export async function offerConfigCleanup(path: string, confirm: (message: string) => Promise<boolean> = promptConfirm, notify: (message: string) => void = console.error): Promise<void> {
  try { await access(path); } catch { return; }
  notify(`Security warning: saved credentials file exists at ${path}. Leaving credentials on disk is a security risk.`);
  if (await confirm("Delete the saved credentials file now?")) {
    await rm(path, { force: true });
    notify("Saved credentials file deleted.");
  } else {
    notify(`Saved credentials file remains at ${path}. Delete it manually when it is no longer needed.`);
  }
}
