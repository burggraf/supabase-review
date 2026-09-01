const SECRET_PATTERNS: readonly [RegExp, string][] = [
  [/((?:postgres(?:ql)?:\/\/))(?:[^\s/@]+):[^\s/@]+@/gi, "$1[redacted]@"],
  [/\b(?:eyJ)[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[redacted JWT]"],
  [/\bsbp_[A-Za-z0-9_-]+\b/g, "[redacted Supabase token]"],
  [/\bsk-ant-[A-Za-z0-9_-]+\b/g, "[redacted API key]"],
  [/\bsk-proj-[A-Za-z0-9_-]+\b/g, "[redacted API key]"],
  [/\bAIza[A-Za-z0-9_-]{20,}\b/g, "[redacted API key]"],
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted email]"],
  [/(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])/g, "[redacted IP]"],
  [/(?<![\w:])(?:[0-9a-f]{1,4}:){2,}[0-9a-f:]{1,4}(?![\w:])/gi, "[redacted IP]"],
];

export function redactText(value: string): string {
  return SECRET_PATTERNS.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), value);
}

export function redact(value: unknown): unknown {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(redact);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]));
  return value;
}
