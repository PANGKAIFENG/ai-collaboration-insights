import { assert, assertEquals } from "../_assert.ts";
import { type AnalyzerCommand, runCodexAnalysis } from "../../packages/analysis/codex_analyzer.ts";
import type { AnalysisDetailPackage, AnalysisPackage } from "../../packages/analysis/redaction.ts";
import { grantConsent, readConsent, revokeConsent } from "../../packages/runtime/commands.ts";

const coverage = {
  requiredCategories: ["intent", "outcome", "verification", "asset", "delegation"] as const,
  presentCategories: ["intent"] as const,
  missingCategories: ["outcome", "verification", "asset", "delegation"] as const,
  categoryRatio: 0.2,
  totalAnchors: 1,
  includedAnchors: 1,
  omittedAnchors: 0,
  totalRounds: 0,
  includedRounds: 0,
  omittedRounds: 0,
  omittedRoundEventRefs: 0,
  truncated: false,
};

const inputPackage: AnalysisPackage = {
  schemaVersion: "2",
  window: { date: "2026-07-15", start: "s", end: "e", timeZone: "Asia/Shanghai" },
  metrics: {
    sessions: 2,
    messages: 4,
    toolCalls: 2,
    skillCalls: 0,
    subagentCalls: 0,
    activeMinutes: 10,
    totalTokens: 100,
  },
  tasks: [
    {
      id: "task-1",
      name: "Synthetic task one",
      outcome: "Synthetic outcome one",
      verification: "not_observed",
      boundaryConfidence: 0.5,
      evidenceIds: ["evidence-1", "event-1"],
      sessionRefs: ["session-1"],
      anchors: [{
        eventId: "event-1",
        category: "intent",
        timestamp: "2026-07-14T11:00:00.000Z",
        kind: "message",
        text: "Implement task one",
      }],
      rounds: [],
      coverage: { ...coverage },
    },
    {
      id: "task-2",
      name: "Synthetic task two",
      outcome: "Synthetic outcome two",
      verification: "not_observed",
      boundaryConfidence: 0.9,
      evidenceIds: ["evidence-2", "event-2"],
      sessionRefs: ["session-2"],
      anchors: [{
        eventId: "event-2",
        category: "intent",
        timestamp: "2026-07-14T11:01:00.000Z",
        kind: "message",
        text: "Implement task two",
      }],
      rounds: [],
      coverage: { ...coverage },
    },
  ],
  coverage: { totalTasks: 2, includedTaskCores: 2, truncatedOptionalDetails: false },
};

const details: AnalysisDetailPackage = {
  schemaVersion: "1",
  tasks: [
    { id: "task-1", events: [{ eventId: "event-1", kind: "message", text: "detail-one" }] },
    { id: "task-2", events: [{ eventId: "event-2", kind: "message", text: "detail-two" }] },
  ],
  coverage: { requestedTasks: 2, includedTasks: 2, truncated: false },
};

function detailProvider(taskIds: string[]): AnalysisDetailPackage {
  return {
    ...details,
    tasks: details.tasks.filter((task) => taskIds.includes(task.id)),
    coverage: {
      requestedTasks: taskIds.length,
      includedTasks: details.tasks.filter((task) => taskIds.includes(task.id)).length,
      truncated: false,
    },
  };
}

const consent = {
  schemaVersion: "1" as const,
  disclosureVersion: "1" as const,
  granted: true,
  grantedAt: "2026-07-15T11:00:00.000Z",
  scope: "daily_standard" as const,
};

function output(taskIds = ["task-1", "task-2"], detailTaskId?: string): string {
  return JSON.stringify({
    tasks: taskIds.map((id) => ({
      id,
      name: `Analyzed ${id}`,
      outcome: `Outcome ${id}`,
      verificationStatus: "not_observed",
      confidence: detailTaskId === id ? 0.9 : 0.7,
      evidenceIds: [id === "task-1" ? "event-1" : "event-2"],
      needsDetail: id === detailTaskId,
      conflict: false,
    })),
    insights: [{
      sessionRef: "session-1",
      direction: "iteration",
      conclusion: "One evidence-backed observation",
      evidenceIds: ["event-1"],
      confidence: 0.7,
    }],
    suggestions: [],
  });
}

Deno.test("never invokes Codex before explicit consent", async () => {
  let invoked = false;
  let detailsRead = false;
  const result = await runCodexAnalysis({
    input: inputPackage,
    detailProvider: (taskIds) => {
      detailsRead = true;
      return detailProvider(taskIds);
    },
    consent: { schemaVersion: "1", disclosureVersion: "1", granted: false },
    runner: () => {
      invoked = true;
      return Promise.resolve({ code: 0, output: "{}" });
    },
  });
  assertEquals(result.status, "not_consented");
  assertEquals(invoked, false);
  assertEquals(detailsRead, false);
});

Deno.test("covers late tasks with isolated ephemeral argv and evidence-backed output", async () => {
  let request: AnalyzerCommand | undefined;
  const result = await runCodexAnalysis({
    input: inputPackage,
    detailProvider,
    consent,
    runner: (value) => {
      request = value;
      return Promise.resolve({ code: 0, output: output() });
    },
  });
  assertEquals(result.status, "complete");
  assertEquals(result.coverage, { totalTasks: 2, analyzedTasks: 2, detailTasks: 0 });
  assert(request);
  assertEquals(request.command, "codex");
  assert(request.args.includes("--ephemeral"));
  assert(request.args.includes("--ignore-user-config"));
  assert(request.args.includes("--ignore-rules"));
  assert(request.args.includes("read-only"));
  assert(request.args.at(-1) === "-");
  assert(request.cwd.startsWith(Deno.env.get("TMPDIR") ?? "/"));
  assert(request.stdin.includes("task-2"));
  assert(!request.stdin.includes("detail-one"));
});

Deno.test("rereads only a requested low-confidence or conflicting task", async () => {
  const requests: AnalyzerCommand[] = [];
  const result = await runCodexAnalysis({
    input: inputPackage,
    detailProvider,
    consent,
    runner: (request) => {
      requests.push(request);
      return Promise.resolve({
        code: 0,
        output: requests.length === 1 ? output(undefined, "task-1") : output(["task-1"]),
      });
    },
  });
  assertEquals(result.status, "complete");
  assert(result.coverage);
  assertEquals(result.coverage.detailTasks, 1);
  assertEquals(requests.length, 2);
  assert(!requests[0].stdin.includes("detail-one"));
  assert(requests[1].stdin.includes("detail-one"));
  assert(!requests[1].stdin.includes("detail-two"));
});

Deno.test("publishes partial enrichment when later tasks or detail reread fail", async () => {
  const partial = await runCodexAnalysis({
    input: inputPackage,
    detailProvider,
    consent,
    runner: () => Promise.resolve({ code: 0, output: output(["task-1"]) }),
  });
  let calls = 0;
  const detailFailure = await runCodexAnalysis({
    input: inputPackage,
    detailProvider,
    consent,
    runner: () => {
      calls++;
      return Promise.resolve(
        calls === 1 ? { code: 0, output: output(undefined, "task-1") } : { code: 124 },
      );
    },
  });
  assertEquals(partial.status, "partial");
  assertEquals(partial.coverage?.analyzedTasks, 1);
  assertEquals(detailFailure.status, "partial");
  assertEquals(detailFailure.coverage?.analyzedTasks, 2);
  assert(detailFailure.reason?.includes("detail"));
});

Deno.test("degrades on invalid core output and runner failure", async () => {
  const invalid = await runCodexAnalysis({
    input: inputPackage,
    detailProvider,
    consent,
    runner: () =>
      Promise.resolve({
        code: 0,
        output: '{"tasks":[],"insights":[],"suggestions":[{},{},{},{}]}',
      }),
  });
  const failed = await runCodexAnalysis({
    input: inputPackage,
    detailProvider,
    consent,
    runner: () => Promise.reject(new Deno.errors.NotFound("codex")),
  });
  assertEquals(invalid.status, "degraded");
  assertEquals(failed.status, "degraded");
});

Deno.test("rejects a session insight anchored only in another session", async () => {
  const result = await runCodexAnalysis({
    input: inputPackage,
    detailProvider,
    consent,
    runner: () =>
      Promise.resolve({
        code: 0,
        output: JSON.stringify({
          tasks: JSON.parse(output()).tasks,
          insights: [{
            sessionRef: "session-1",
            direction: "iteration",
            conclusion: "Cross-session evidence must be rejected",
            evidenceIds: ["event-2"],
            confidence: 0.8,
          }],
          suggestions: [],
        }),
      }),
  });
  assertEquals(result.status, "degraded");
});

Deno.test("persists and revokes only versioned consent state", async () => {
  const root = await Deno.makeTempDir();
  const path = `${root}/consent.json`;
  try {
    await grantConsent(path, new Date("2026-07-15T11:00:00.000Z"));
    assertEquals((await readConsent(path)).granted, true);
    await revokeConsent(path);
    assertEquals((await readConsent(path)).granted, false);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
