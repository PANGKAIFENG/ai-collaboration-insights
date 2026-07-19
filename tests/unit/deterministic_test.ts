import { assert, assertEquals } from "../_assert.ts";
import { analyzeDeterministically } from "../../packages/analysis/deterministic.ts";
import { assembleSourceTurns } from "../../packages/analysis/turns.ts";
import { EVENT_SCHEMA_VERSION, type UnifiedEvent } from "../../packages/core/types.ts";
import { reportDateWindow } from "../../packages/core/time.ts";

function event(
  id: string,
  timestamp: string,
  kind: UnifiedEvent["kind"],
  overrides: Partial<UnifiedEvent> = {},
): UnifiedEvent {
  return {
    schemaVersion: EVENT_SCHEMA_VERSION,
    eventId: id,
    sourceTool: "codex",
    sourceSessionId: "session",
    timestamp,
    kind,
    projectRef: "project-a",
    projectLabel: "alpha",
    availability: "available",
    ...overrides,
  };
}

Deno.test("builds five-minute activity segments and merges a twenty-minute project gap", () => {
  const result = analyzeDeterministically([
    event("u1", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "Implement daily report",
    }),
    event("a1", "2026-07-14T11:03:00.000Z", "message", {
      role: "assistant",
      contentPreview: "Implemented the report.",
    }),
    event("u2", "2026-07-14T11:22:00.000Z", "message", {
      role: "user",
      contentPreview: "Fix the boundary case",
    }),
  ], reportDateWindow("2026-07-15", "Asia/Shanghai"));
  assertEquals(result.workBlocks.length, 1);
  assertEquals(result.workBlocks[0].activeMinutes, 13);
  assertEquals(result.tasks.length, 1);
  assertEquals(result.tasks[0].name, "Implement daily report");
});

Deno.test("never merges activity from different projects", () => {
  const result = analyzeDeterministically([
    event("a", "2026-07-14T11:00:00.000Z", "message", { role: "user" }),
    event("b", "2026-07-14T11:01:00.000Z", "message", {
      role: "user",
      projectRef: "project-b",
      projectLabel: "beta",
    }),
  ], reportDateWindow("2026-07-15", "Asia/Shanghai"));
  assertEquals(result.workBlocks.length, 2);
});

Deno.test("redacts absolute paths from deterministic task display fields", () => {
  const result = analyzeDeterministically([
    event("intent", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "Review /Users/synthetic/private/project/spec.md",
    }),
    event("result", "2026-07-14T11:01:00.000Z", "message", {
      role: "assistant",
      contentPreview: "Wrote /root/gate/result.json from /var/folders/zz/source.txt",
    }),
  ], reportDateWindow("2026-07-15", "Asia/Shanghai"));

  assertEquals(result.tasks.length, 1);
  assert(!result.tasks[0].name.includes("/Users/"));
  assert(!result.tasks[0].outcome.includes("/root/"));
  assert(!result.tasks[0].outcome.includes("/var/folders/"));
  assert(result.tasks[0].name.includes("[PRIVATE_PATH]"));
  assert(result.tasks[0].outcome.includes("[PRIVATE_PATH]"));
});

Deno.test("does not classify zero errors as failed verification", () => {
  const report = analyzeDeterministically([
    event("goal", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "实现并验证功能",
    }),
    {
      ...event("verify-call", "2026-07-14T11:00:01.000Z", "tool_call"),
      actionCategory: "verification",
      toolName: "exec_command",
    },
    {
      ...event("verify-result", "2026-07-14T11:00:02.000Z", "message", {
        role: "assistant",
      }),
      actionCategory: "verification",
      toolName: "exec_command",
      contentPreview: "check completed with 0 error",
    },
  ], reportDateWindow("2026-07-15", "Asia/Shanghai"));

  assertEquals(report.tasks[0].verification, "verified");
});

Deno.test("keeps legacy task and evidence provenance anchored to an assembled source turn", () => {
  const events = [
    event("scaffold", "2026-07-14T10:59:00.000Z", "message", {
      role: "user",
      contentPreview: "# AGENTS.md instructions\nSynthetic scaffolding",
    }),
    event("legacy-goal", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "修复旧会话的任务来源",
    }),
    event("legacy-result", "2026-07-14T11:01:00.000Z", "message", {
      role: "assistant",
      contentPreview: "已完成",
    }),
  ];

  const analysis = analyzeDeterministically(
    events,
    reportDateWindow("2026-07-15", "Asia/Shanghai"),
  );
  const assembled = assembleSourceTurns(events);
  const turnIds = new Set(assembled.turns.map((turn) => turn.id));
  const task = analysis.tasks[0];
  const packet = analysis.evidencePackets[0];

  assertEquals(assembled.turns.length, 1);
  assertEquals(assembled.turns[0].boundary, "inferred");
  assertEquals(task.sourceTurnIds.length, 1);
  assertEquals(task.sourceTurnIds, [assembled.turns[0].id]);
  assertEquals(events[1].sourceTurnId, assembled.turns[0].id);
  assertEquals(events[1].turnBoundary, "inferred");
  assert(packet.anchors.every((anchor) => anchor.sourceTurnId === assembled.turns[0].id));
  assert(
    packet.anchors.every((anchor) => !anchor.sourceTurnId || turnIds.has(anchor.sourceTurnId)),
  );
  assert(!events[0].sourceTurnId);
});

Deno.test("counts tokens and subagents without adding parallel duration", () => {
  const result = analyzeDeterministically([
    event("u", "2026-07-14T11:00:00.000Z", "message", { role: "user" }),
    event("tokens", "2026-07-14T11:01:00.000Z", "usage", {
      usage: { inputTokens: 100, outputTokens: 25, totalTokens: 125 },
      usageSemantics: "session_cumulative",
    }),
    event("agent", "2026-07-14T11:02:00.000Z", "subagent", {
      subagentDepth: 1,
      subagentRunId: "run-a",
      subagentStatus: "started",
    }),
  ], reportDateWindow("2026-07-15", "Asia/Shanghai"));
  assertEquals(result.usageMetrics.tokens.totalTokens, 125);
  assertEquals(result.usageMetrics.subagentCalls, 1);
  assertEquals(result.usageMetrics.activeMinutes, 7);
});

Deno.test("does not double count overlapping activity across projects", () => {
  const result = analyzeDeterministically([
    event("a", "2026-07-14T11:00:00.000Z", "message", { role: "user" }),
    event("b", "2026-07-14T11:01:00.000Z", "message", {
      role: "user",
      sourceSessionId: "session-b",
      projectRef: "project-b",
    }),
  ], reportDateWindow("2026-07-15", "Asia/Shanghai"));
  assertEquals(result.workBlocks.length, 2);
  assertEquals(result.usageMetrics.activeMinutes, 6);
});

Deno.test("preserves total rounds while exposing at most five key rounds and one packet per task", () => {
  const events: UnifiedEvent[] = [
    event("intent", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "Implement semantic rounds",
    }),
    event("attempt-0", "2026-07-14T11:01:00.000Z", "tool_call", {
      toolName: "apply_patch",
      contentDigest: "attempt-0",
    }),
  ];
  for (let index = 1; index <= 6; index++) {
    const feedbackMinute = String(index * 2).padStart(2, "0");
    const attemptMinute = String(index * 2 + 1).padStart(2, "0");
    events.push(
      event(`feedback-${index}`, `2026-07-14T11:${feedbackMinute}:00.000Z`, "message", {
        role: "user",
        contentPreview: `Adjust approach ${index}`,
      }),
      event(`attempt-${index}`, `2026-07-14T11:${attemptMinute}:00.000Z`, "tool_call", {
        toolName: "apply_patch",
        contentDigest: `attempt-${index}`,
      }),
    );
  }
  const result = analyzeDeterministically(
    events,
    reportDateWindow("2026-07-15", "Asia/Shanghai"),
  );
  assertEquals(result.tasks.length, 1);
  assertEquals(result.tasks[0].semanticRoundCount, 7);
  assertEquals(result.tasks[0].effectiveRoundCount, 6);
  assertEquals(result.tasks[0].keyRounds.length, 5);
  assertEquals(result.evidencePackets.length, 1);
  assertEquals(result.evidencePackets[0].taskId, result.tasks[0].id);
});

Deno.test("does not promote a repeated failure loop to iteration evidence", () => {
  const result = analyzeDeterministically([
    event("intent", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "Run the same check",
    }),
    event("test-1", "2026-07-14T11:01:00.000Z", "tool_call", {
      toolName: "deno_test",
      contentDigest: "same-test",
    }),
    event("failure-1", "2026-07-14T11:02:00.000Z", "message", {
      role: "assistant",
      contentPreview: "Tests failed with the same error",
      contentDigest: "same-error",
    }),
    event("test-2", "2026-07-14T11:03:00.000Z", "tool_call", {
      toolName: "deno_test",
      contentDigest: "same-test",
    }),
    event("failure-2", "2026-07-14T11:04:00.000Z", "message", {
      role: "assistant",
      contentPreview: "Tests failed with the same error",
      contentDigest: "same-error",
    }),
  ], reportDateWindow("2026-07-15", "Asia/Shanghai"));
  assertEquals(result.tasks[0].hasIteration, false);
  assertEquals(result.tasks[0].effectiveRoundCount, 0);
  assertEquals(result.evidence.some((item) => item.type === "iteration"), false);
});

Deno.test("does not infer verification or asset creation from keywords alone", () => {
  const result = analyzeDeterministically([
    event("intent", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "Discuss tests, Skill docs, templates and reusable scripts",
    }),
    event("answer", "2026-07-14T11:01:00.000Z", "message", {
      role: "assistant",
      contentPreview: "You could run tests and create a Skill document later",
    }),
  ], reportDateWindow("2026-07-15", "Asia/Shanghai"));

  assertEquals(result.tasks[0].hasVerification, false);
  assertEquals(result.tasks[0].hasReusableAsset, false);
  assertEquals(result.evidence.some((item) => item.type === "verification"), false);
  assertEquals(result.evidence.some((item) => item.type === "assetization"), false);
});

Deno.test("requires an action and result to create typed verification and asset evidence", () => {
  const result = analyzeDeterministically([
    event("intent", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "Add a reusable report check",
    }),
    event("write", "2026-07-14T11:01:00.000Z", "tool_call", {
      toolName: "apply_patch",
      contentDigest: "write-check",
    }),
    event("asset-result", "2026-07-14T11:02:00.000Z", "message", {
      role: "assistant",
      contentPreview: "Added the reusable report check script",
    }),
    event("verify", "2026-07-14T11:03:00.000Z", "tool_call", {
      toolName: "deno_test",
      contentDigest: "run-check",
    }),
    event("verify-result", "2026-07-14T11:04:00.000Z", "message", {
      role: "assistant",
      contentPreview: "Tests passed: 8 passed, 0 failed",
    }),
  ], reportDateWindow("2026-07-15", "Asia/Shanghai"));

  const verification = result.evidence.find((item) => item.type === "verification");
  const asset = result.evidence.find((item) => item.type === "assetization");
  assertEquals(result.tasks[0].hasVerification, true);
  assertEquals(result.tasks[0].hasReusableAsset, true);
  assertEquals(verification?.sourceCategories, ["tool_action", "assistant_result"]);
  assertEquals(asset?.sourceCategories, ["artifact_change", "assistant_result"]);
});

Deno.test("accepts a matched successful verification tool result without an assistant summary", () => {
  const result = analyzeDeterministically([
    event("intent", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "Run the release checks",
    }),
    event("verify", "2026-07-14T11:01:00.000Z", "tool_call", {
      actionCategory: "verification",
      toolCallId: "call-a",
    }),
    event("verify-result", "2026-07-14T11:02:00.000Z", "tool_result", {
      actionCategory: "verification",
      toolCallId: "call-a",
      parentEventId: "verify",
      toolResultStatus: "success",
      contentDigest: "synthetic-result",
    }),
  ], reportDateWindow("2026-07-15", "Asia/Shanghai"));

  const verification = result.evidence.find((item) => item.type === "verification");
  assertEquals(result.tasks[0].hasVerification, true);
  assertEquals(result.tasks[0].verification, "verified");
  assertEquals(verification?.sourceCategories, ["tool_action", "tool_result"]);
});

Deno.test("observes a matched failed verification result without marking it verified", () => {
  const result = analyzeDeterministically([
    event("intent", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "Run the release checks",
    }),
    event("verify", "2026-07-14T11:01:00.000Z", "tool_call", {
      actionCategory: "verification",
      toolCallId: "call-a",
    }),
    event("verify-result", "2026-07-14T11:02:00.000Z", "tool_result", {
      toolCallId: "call-a",
      parentEventId: "verify",
      toolResultStatus: "error",
      contentDigest: "synthetic-failed-result",
    }),
  ], reportDateWindow("2026-07-15", "Asia/Shanghai"));

  const verification = result.evidence.find((item) => item.type === "verification");
  assertEquals(result.tasks[0].hasVerification, true);
  assertEquals(result.tasks[0].verification, "failed");
  assertEquals(verification?.sourceCategories, ["tool_action", "tool_result"]);
});

Deno.test("observes an explicit failed verification summary after a verification action", () => {
  const result = analyzeDeterministically([
    event("intent", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "Check the release candidate",
    }),
    event("verify", "2026-07-14T11:01:00.000Z", "tool_call", {
      actionCategory: "verification",
    }),
    event("verify-summary", "2026-07-14T11:02:00.000Z", "message", {
      role: "assistant",
      contentPreview: "Release verification failed because the checksum did not match",
    }),
  ], reportDateWindow("2026-07-15", "Asia/Shanghai"));

  assertEquals(result.tasks[0].hasVerification, true);
  assertEquals(result.tasks[0].verification, "failed");
});

Deno.test("prioritizes a failed verification summary over an earlier passing summary", () => {
  const result = analyzeDeterministically([
    event("intent", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "Run the release checks",
    }),
    event("verify", "2026-07-14T11:01:00.000Z", "tool_call", {
      actionCategory: "verification",
    }),
    event("pass-summary", "2026-07-14T11:02:00.000Z", "message", {
      role: "assistant",
      contentPreview: "8 passed, 0 failed",
    }),
    event("fail-summary", "2026-07-14T11:03:00.000Z", "message", {
      role: "assistant",
      contentPreview: "8 passed, 1 failed",
    }),
  ], reportDateWindow("2026-07-15", "Asia/Shanghai"));

  assertEquals(result.tasks[0].verification, "failed");
});

Deno.test("uses a later passing verification summary after an earlier failure", () => {
  const result = analyzeDeterministically([
    event("intent", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "Run the release checks",
    }),
    event("verify", "2026-07-14T11:01:00.000Z", "tool_call", {
      actionCategory: "verification",
    }),
    event("fail-summary", "2026-07-14T11:02:00.000Z", "message", {
      role: "assistant",
      contentPreview: "8 passed, 1 failed",
    }),
    event("pass-summary", "2026-07-14T11:03:00.000Z", "message", {
      role: "assistant",
      contentPreview: "9 passed, 0 failed",
    }),
  ], reportDateWindow("2026-07-15", "Asia/Shanghai"));

  assertEquals(result.tasks[0].verification, "verified");
});

Deno.test("prioritizes a failed tool result over an earlier successful result", () => {
  const result = analyzeDeterministically([
    event("intent", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "Run the release checks",
    }),
    event("verify", "2026-07-14T11:01:00.000Z", "tool_call", {
      actionCategory: "verification",
      toolCallId: "call-a",
    }),
    event("pass-result", "2026-07-14T11:02:00.000Z", "tool_result", {
      actionCategory: "verification",
      toolCallId: "call-a",
      toolResultStatus: "success",
    }),
    event("fail-result", "2026-07-14T11:03:00.000Z", "tool_result", {
      actionCategory: "verification",
      toolCallId: "call-b",
      toolResultStatus: "error",
    }),
  ], reportDateWindow("2026-07-15", "Asia/Shanghai"));

  assertEquals(result.tasks[0].verification, "failed");
});

Deno.test("uses a later successful verification result after an earlier failure", () => {
  const result = analyzeDeterministically([
    event("intent", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "Run the release checks",
    }),
    event("verify-a", "2026-07-14T11:01:00.000Z", "tool_call", {
      actionCategory: "verification",
      toolCallId: "call-a",
    }),
    event("fail-result", "2026-07-14T11:02:00.000Z", "tool_result", {
      actionCategory: "verification",
      toolCallId: "call-a",
      parentEventId: "verify-a",
      toolResultStatus: "error",
    }),
    event("verify-b", "2026-07-14T11:03:00.000Z", "tool_call", {
      actionCategory: "verification",
      toolCallId: "call-b",
    }),
    event("pass-result", "2026-07-14T11:04:00.000Z", "tool_result", {
      actionCategory: "verification",
      toolCallId: "call-b",
      parentEventId: "verify-b",
      toolResultStatus: "success",
    }),
  ], reportDateWindow("2026-07-15", "Asia/Shanghai"));

  assertEquals(result.tasks[0].verification, "verified");
});

Deno.test("promotes a successful read-back after mutation to verification", () => {
  const result = analyzeDeterministically([
    event("intent", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "Update the generated dashboard",
    }),
    event("write", "2026-07-14T11:01:00.000Z", "tool_call", {
      actionCategory: "artifact_change",
      toolCallId: "write-call",
    }),
    event("read-back", "2026-07-14T11:02:00.000Z", "tool_call", {
      actionCategory: "inspection" as never,
      toolCallId: "read-call",
    }),
    event("read-result", "2026-07-14T11:03:00.000Z", "tool_result", {
      actionCategory: "inspection" as never,
      toolCallId: "read-call",
      parentEventId: "read-back",
      toolResultStatus: "success",
      contentDigest: "synthetic-read-back-result",
    }),
  ], reportDateWindow("2026-07-15", "Asia/Shanghai"));

  const verification = result.evidence.find((item) => item.type === "verification");
  assertEquals(result.tasks[0].hasVerification, true);
  assertEquals(result.tasks[0].verification, "verified");
  assertEquals(verification?.sourceCategories, ["tool_action", "tool_result"]);
});

Deno.test("does not promote an inspection before mutation to verification", () => {
  const result = analyzeDeterministically([
    event("intent", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "Research the existing dashboard before editing it",
    }),
    event("read", "2026-07-14T11:01:00.000Z", "tool_call", {
      actionCategory: "inspection" as never,
      toolCallId: "read-call",
    }),
    event("read-result", "2026-07-14T11:02:00.000Z", "tool_result", {
      actionCategory: "inspection" as never,
      toolCallId: "read-call",
      parentEventId: "read",
      toolResultStatus: "success",
    }),
    event("write", "2026-07-14T11:03:00.000Z", "tool_call", {
      actionCategory: "artifact_change",
      toolCallId: "write-call",
    }),
  ], reportDateWindow("2026-07-15", "Asia/Shanghai"));

  assertEquals(result.tasks[0].hasVerification, false);
  assertEquals(result.tasks[0].verification, "not_observed");
});

Deno.test("promotes an inspection requested explicitly by the user to verification", () => {
  const result = analyzeDeterministically([
    event("intent", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "请核对已发布页面的状态和内容是否正确",
    }),
    event("inspect", "2026-07-14T11:01:00.000Z", "tool_call", {
      actionCategory: "inspection" as never,
      toolCallId: "inspect-call",
    }),
    event("inspect-result", "2026-07-14T11:02:00.000Z", "tool_result", {
      actionCategory: "inspection" as never,
      toolCallId: "inspect-call",
      parentEventId: "inspect",
      toolResultStatus: "success",
    }),
  ], reportDateWindow("2026-07-15", "Asia/Shanghai"));

  assertEquals(result.tasks[0].hasVerification, true);
  assertEquals(result.tasks[0].verification, "verified");
});

Deno.test("does not promote ordinary read-only inspection to verification", () => {
  const result = analyzeDeterministically([
    event("intent", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "调研现有页面的信息架构",
    }),
    event("inspect", "2026-07-14T11:01:00.000Z", "tool_call", {
      actionCategory: "inspection" as never,
      toolCallId: "inspect-call",
    }),
    event("inspect-result", "2026-07-14T11:02:00.000Z", "tool_result", {
      actionCategory: "inspection" as never,
      toolCallId: "inspect-call",
      parentEventId: "inspect",
      toolResultStatus: "success",
    }),
  ], reportDateWindow("2026-07-15", "Asia/Shanghai"));

  assertEquals(result.tasks[0].hasVerification, false);
  assertEquals(result.tasks[0].verification, "not_observed");
});

Deno.test("marks a failed read-back failed and exposes its error status", () => {
  const result = analyzeDeterministically([
    event("intent", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "Update the generated dashboard",
    }),
    event("write", "2026-07-14T11:01:00.000Z", "tool_call", {
      actionCategory: "artifact_change",
      toolCallId: "write-call",
    }),
    event("read-back", "2026-07-14T11:02:00.000Z", "tool_call", {
      actionCategory: "inspection" as never,
      toolCallId: "read-call",
    }),
    event("read-result", "2026-07-14T11:03:00.000Z", "tool_result", {
      actionCategory: "inspection" as never,
      toolCallId: "read-call",
      parentEventId: "read-back",
      toolResultStatus: "error",
    }),
  ], reportDateWindow("2026-07-15", "Asia/Shanghai"));

  assertEquals(result.tasks[0].verification, "failed");
  assertEquals(
    result.evidencePackets[0].anchors.find((anchor) => anchor.eventId === "read-result")
      ?.resultStatus,
    "error",
  );
});
