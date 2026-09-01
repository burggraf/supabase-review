import { expect, test } from "bun:test";
import { targets } from "../scripts/build";

test("defines six unique targets including Windows ARM64", () => {
  expect(targets).toHaveLength(6);
  expect(new Set(targets.map(([name]) => name)).size).toBe(6);
  expect(targets.some(([name, target]) => name === "windows-arm64" && target === "bun-windows-arm64")).toBe(true);
});
