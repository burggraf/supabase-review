import { confirm, input, password } from "@inquirer/prompts";

export async function promptSecret(message: string): Promise<string> {
  return password({ message, mask: "*" });
}

export async function promptText(message: string): Promise<string> {
  return input({ message });
}

export async function promptConfirm(message: string): Promise<boolean> {
  return confirm({ message });
}
