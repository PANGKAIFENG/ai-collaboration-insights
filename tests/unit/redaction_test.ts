import { assert, assertEquals } from "../_assert.ts";
import { buildAnalysisPackage, redactText } from "../../packages/analysis/redaction.ts";
import type { DailyReport, UnifiedEvent } from "../../packages/core/types.ts";

Deno.test("removes common secrets private paths and fenced code", () => {
  const input = [
    "token sk-synthetic1234567890",
    "Bearer synthetic-secret-value",
    "at /Users/synthetic/private/project/file.ts",
    "```ts\nconst secret = 'value';\n```",
  ].join("\n");
  const redacted = redactText(input, 500);
  assert(!redacted.includes("sk-synthetic"));
  assert(!redacted.includes("Bearer synthetic"));
  assert(!redacted.includes("/Users/synthetic"));
  assert(!redacted.includes("const secret"));
  assert(redacted.includes("[REDACTED_SECRET]"));
  assert(redacted.includes("[PRIVATE_PATH]"));
  assert(redacted.includes("[CODE_BLOCK_REMOVED]"));
});

Deno.test("analysis package excludes tool results and stays bounded", () => {
  const report = {
    window: { date: "2026-07-15", start: "s", end: "e", timeZone: "Asia/Shanghai" },
    usageMetrics: {
      sessions: 1,
      messages: 1,
      toolCalls: 1,
      skillCalls: 0,
      subagentCalls: 0,
      activeMinutes: 5,
      tokens: {},
    },
    tasks: [],
    evidence: [],
  } as unknown as DailyReport;
  const events = [
    { kind: "message", role: "user", contentPreview: "A".repeat(1000) },
    { kind: "tool_result", contentPreview: "must-not-send" },
  ] as UnifiedEvent[];
  const value = buildAnalysisPackage(report, events, 600);
  const serialized = JSON.stringify(value);
  assert(serialized.length <= 600);
  assert(!serialized.includes("must-not-send"));
  assertEquals(value.messages.length, 1);
});
