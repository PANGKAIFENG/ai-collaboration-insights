import { assert, assertEquals } from "../_assert.ts";
import { buildTaskEvidencePacket } from "../../packages/analysis/evidence.ts";
import { segmentSemanticRounds } from "../../packages/analysis/rounds.ts";
import type { TaskBoundary } from "../../packages/analysis/tasks.ts";
import { EVENT_SCHEMA_VERSION, type UnifiedEvent } from "../../packages/core/types.ts";

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
    sourceSessionId: "session-a",
    timestamp,
    kind,
    projectRef: "project-a",
    projectLabel: "alpha",
    availability: "available",
    ...overrides,
  };
}

function task(events: UnifiedEvent[]): TaskBoundary {
  return {
    id: "task-1",
    name: "Synthetic task",
    sourceSessionIds: ["session-a"],
    eventIds: events.map((item) => item.eventId),
    events,
    start: events[0].timestamp,
    end: events.at(-1)?.timestamp ?? events[0].timestamp,
    activeMinutes: 5,
    confidence: 0.8,
    relationIds: [],
  };
}

Deno.test("builds an independent redacted evidence packet with category diagnostics", () => {
  const events = [
    event("intent", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "Implement at /Users/synthetic/private with sk-synthetic1234567890",
    }),
    event("delegation", "2026-07-14T11:01:00.000Z", "subagent", {
      subagentRunId: "child",
      subagentStatus: "started",
    }),
    event("verify", "2026-07-14T11:02:00.000Z", "tool_call", { toolName: "deno_test" }),
    event("outcome", "2026-07-14T11:03:00.000Z", "message", {
      role: "assistant",
      contentPreview: "Tests passed and docs/report.md was created",
    }),
  ];
  const packet = buildTaskEvidencePacket(task(events), segmentSemanticRounds("task-1", events));
  const serialized = JSON.stringify(packet);
  assert(!serialized.includes("/Users/synthetic"));
  assert(!serialized.includes("sk-synthetic"));
  assert(packet.coverage.presentCategories.includes("intent"));
  assert(packet.coverage.presentCategories.includes("outcome"));
  assert(packet.coverage.presentCategories.includes("verification"));
  assert(packet.coverage.presentCategories.includes("asset"));
  assert(packet.coverage.presentCategories.includes("delegation"));
  assertEquals(packet.coverage.missingCategories, []);
});

Deno.test("keeps core anchors and reports omissions when the task budget is tight", () => {
  const events = [
    event("intent", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: `Implement ${"A".repeat(400)}`,
    }),
    event("delegation-start", "2026-07-14T11:00:10.000Z", "subagent", {
      subagentRunId: "child",
      subagentStatus: "started",
    }),
    ...Array.from(
      { length: 20 },
      (_, index) =>
        event(
          `tool-${index}`,
          `2026-07-14T11:${String(index + 1).padStart(2, "0")}:00.000Z`,
          "tool_call",
          {
            toolName: `synthetic_tool_${index}`,
            contentPreview: "B".repeat(400),
          },
        ),
    ),
    event("delegation-end", "2026-07-14T11:29:00.000Z", "subagent", {
      subagentRunId: "child",
      subagentStatus: "completed",
    }),
    event("outcome", "2026-07-14T11:30:00.000Z", "message", {
      role: "assistant",
      contentPreview: `Completed ${"C".repeat(400)}`,
    }),
  ];
  const packet = buildTaskEvidencePacket(
    task(events),
    segmentSemanticRounds("task-1", events),
    { maxBytes: 1_500 },
  );
  assert(new TextEncoder().encode(JSON.stringify(packet)).length <= 1_500);
  assert(packet.anchors.some((anchor) => anchor.category === "intent"));
  assert(packet.anchors.some((anchor) => anchor.category === "outcome"));
  assert(packet.anchors.some((anchor) => anchor.eventId === "delegation-start"));
  assert(packet.anchors.some((anchor) => anchor.eventId === "delegation-end"));
  assert(packet.coverage.truncated);
  assert(packet.coverage.omittedAnchors > 0 || packet.coverage.omittedRounds > 0);
  assert(packet.coverage.omittedRoundEventRefs > 0);
});
