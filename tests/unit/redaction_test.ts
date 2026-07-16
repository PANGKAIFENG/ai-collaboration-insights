import { assert, assertEquals } from "../_assert.ts";
import {
  buildAnalysisDetails,
  buildAnalysisPackage,
  redactText,
} from "../../packages/analysis/redaction.ts";
import type {
  DailyReport,
  TaskEvidencePacket,
  TaskSummary,
  UnifiedEvent,
} from "../../packages/core/types.ts";

Deno.test("removes common secrets private paths and fenced code", () => {
  const input = [
    "token sk-synthetic1234567890",
    "Bearer synthetic-secret-value",
    "at /Users/synthetic/private/project/file.ts",
    "at /home/synthetic/private/project/file.ts",
    "at /root/gate/private-result.json",
    "at /var/folders/zz/synthetic/private-result.json",
    "at /private/var/folders/zz/synthetic/private-result.json",
    "```ts\nconst secret = 'value';\n```",
  ].join("\n");
  const redacted = redactText(input, 500);
  assert(!redacted.includes("sk-synthetic"));
  assert(!redacted.includes("Bearer synthetic"));
  assert(!redacted.includes("/Users/synthetic"));
  assert(!redacted.includes("/home/synthetic"));
  assert(!redacted.includes("/root/gate"));
  assert(!redacted.includes("/var/folders"));
  assert(!redacted.includes("/private/var"));
  assert(!redacted.includes("const secret"));
  assert(redacted.includes("[REDACTED_SECRET]"));
  assert(redacted.includes("[PRIVATE_PATH]"));
  assert(redacted.includes("[CODE_BLOCK_REMOVED]"));
});

function task(index: number): TaskSummary {
  return {
    id: `task-${index}`,
    name: `Synthetic task ${index}`,
    start: "2026-07-14T11:00:00.000Z",
    end: "2026-07-14T11:05:00.000Z",
    activeMinutes: 5,
    outcome: `Synthetic outcome ${index}`,
    verification: "not_observed",
    confidence: index === 30 ? 0.5 : 0.85,
    evidenceIds: [`task-${index}-intent`],
    sourceSessionIds: [`session-${index}`],
    relationIds: [],
    semanticRoundCount: 1,
    effectiveRoundCount: 0,
    keyRounds: [],
    hasIteration: false,
    hasVerification: false,
    hasReusableAsset: false,
  };
}

function packet(index: number): TaskEvidencePacket {
  return {
    schemaVersion: "1",
    taskId: `task-${index}`,
    anchors: [{
      eventId: `event-${index}`,
      category: "intent",
      timestamp: "2026-07-14T11:00:00.000Z",
      kind: "message",
      text: `Implement synthetic task ${index} ${"A".repeat(100)}`,
    }],
    rounds: [],
    coverage: {
      requiredCategories: ["intent", "outcome", "verification", "asset", "delegation"],
      presentCategories: ["intent"],
      missingCategories: ["outcome", "verification", "asset", "delegation"],
      categoryRatio: 0.2,
      totalAnchors: 1,
      includedAnchors: 1,
      omittedAnchors: 0,
      totalRounds: 0,
      includedRounds: 0,
      omittedRounds: 0,
      omittedRoundEventRefs: 0,
      truncated: false,
    },
  };
}

function report(taskCount = 30): DailyReport {
  const tasks = Array.from({ length: taskCount }, (_, index) => task(index + 1));
  return {
    window: {
      date: "2026-07-15",
      start: "2026-07-14T11:00:00.000Z",
      end: "2026-07-15T11:00:00.000Z",
      timeZone: "Asia/Shanghai",
    },
    usageMetrics: {
      sessions: taskCount,
      messages: taskCount,
      toolCalls: 0,
      skillCalls: 0,
      subagentCalls: 0,
      subagentInterrupted: 0,
      activeMinutes: taskCount * 5,
      tokens: {},
    },
    tasks,
    evidencePackets: tasks.map((_, index) => packet(index + 1)),
    evidence: [],
  } as unknown as DailyReport;
}

Deno.test("analysis package covers every task core before optional detail", () => {
  const value = buildAnalysisPackage(report(), 16_000);
  const serialized = JSON.stringify(value);
  assert(new TextEncoder().encode(serialized).length <= 16_000);
  assertEquals(value.tasks.length, 30);
  assertEquals(value.tasks.at(-1)?.id, "task-30");
  assertEquals(value.coverage.includedTaskCores, 30);
  assertEquals(value.coverage.totalTasks, 30);
  assert(!("messages" in value));
});

Deno.test("budget trimming preserves one anchor for every present core category", () => {
  const daily = report(1);
  const categories = ["intent", "outcome", "verification", "asset", "delegation"] as const;
  daily.evidencePackets[0].anchors = categories.flatMap((category, index) => [
    {
      eventId: `${category}-core`,
      category,
      timestamp: `2026-07-14T11:0${index}:00.000Z`,
      kind: "message" as const,
      text: `${category} ${"A".repeat(500)}`,
    },
    {
      eventId: `${category}-optional`,
      category,
      timestamp: `2026-07-14T11:1${index}:00.000Z`,
      kind: "message" as const,
      text: `${category} ${"B".repeat(500)}`,
    },
  ]);
  const value = buildAnalysisPackage(daily, 2_000);
  const included = new Set(value.tasks[0].anchors.map((anchor) => anchor.category));
  assertEquals([...included].sort(), [...categories].sort());
});

Deno.test("detail package includes only requested task events and stays redacted", () => {
  const daily = report(2);
  const events = [
    {
      eventId: "event-1",
      sourceSessionId: "session-1",
      timestamp: "2026-07-14T11:00:00.000Z",
      kind: "message",
      role: "user",
      contentPreview: "Read /Users/synthetic/secret with sk-synthetic1234567890",
    },
    {
      eventId: "event-2",
      sourceSessionId: "session-2",
      timestamp: "2026-07-14T11:01:00.000Z",
      kind: "message",
      role: "user",
      contentPreview: "must-not-send",
    },
  ] as UnifiedEvent[];
  const details = buildAnalysisDetails(daily, events, ["task-1"], 2_000);
  const serialized = JSON.stringify(details);
  assertEquals(details.tasks.map((item) => item.id), ["task-1"]);
  assert(!serialized.includes("task-2"));
  assert(!serialized.includes("must-not-send"));
  assert(!serialized.includes("/Users/synthetic"));
  assert(!serialized.includes("sk-synthetic"));
  assert(new TextEncoder().encode(serialized).length <= 2_000);
});
