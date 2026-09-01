import { expect, test } from "bun:test";
import { redactText } from "../src/redact";

test("redacts known secrets and personal identifiers", () => {
  const value = "postgres://user:p%40ss@example.com/db eyJ" + "a".repeat(25) + "." + "b".repeat(12) + "." + "c".repeat(12) + " sbp_" + "x".repeat(20) + " sk-ant-" + "x".repeat(20) + " AIza" + "x".repeat(25) + " a@b.example 192.168.1.1 2001:db8::1";
  const result = redactText(value);
  expect(result).not.toContain("p%40ss");
  expect(result).not.toContain("sbp_");
  expect(result).not.toContain("192.168.1.1");
});

test("leaves ordinary SQL identifiers intact", () => {
  expect(redactText("select user_email, api_key_value from public.users")).toContain("user_email");
});
