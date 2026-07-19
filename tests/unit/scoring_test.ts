import { assert, assertEquals } from "../_assert.ts";
import { scoreCollaboration } from "../../packages/analysis/scoring.ts";
import type { Evidence, TaskSummary } from "../../packages/core/types.ts";

function task(index: number, options: Partial<TaskSummary> = {}): TaskSummary {
  return {
    id: `task-${index}`,
    name: `Synthetic task ${index}`,
    start: "2026-07-14T11:00:00.000Z",
    end: "2026-07-14T11:10:00.000Z",
    activeMinutes: 10,
    outcome: "Synthetic outcome",
    verification: "verified",
    confidence: 0.8,
    evidenceIds: [`intent-${index}`, `iteration-${index}`, `verification-${index}`],
    sourceSessionIds: [`session-${index}`],
    relationIds: [],
    semanticRoundCount: 2,
    effectiveRoundCount: 1,
    keyRounds: [],
    hasIteration: true,
    hasVerification: true,
    hasReusableAsset: false,
    ...options,
    sourceTurnIds: options.sourceTurnIds ?? [`turn-${index}`],
  };
}

function evidenceFor(tasks: TaskSummary[]): Evidence[] {
  return tasks.flatMap((item) =>
    item.evidenceIds.map((id) => ({
      id,
      type: id.split("-")[0],
      label: id,
      eventIds: [item.id],
      confidence: 0.8,
    }))
  );
}

function typedEvidence(
  id: string,
  type: string,
  confidence: number,
  sourceCategories: string[],
  availability = "complete",
): Evidence {
  return {
    id,
    type,
    label: id,
    eventIds: [`event-${id}`],
    confidence,
    sourceCategories,
    availability,
  } as unknown as Evidence;
}

function dimensionReason(
  score: ReturnType<typeof scoreCollaboration>,
  key: string,
): string {
  return (score.dimensions.find((item) => item.key === key) as unknown as { reason?: string })
    ?.reason ?? "";
}

Deno.test("usage volume cannot change score or maturity", () => {
  const tasks = [
    task(1, { hasIteration: false, hasVerification: false, evidenceIds: ["intent-1"] }),
  ];
  const evidence = evidenceFor(tasks);
  const first = scoreCollaboration(tasks, evidence);
  const second = scoreCollaboration(tasks, evidence);
  assertEquals(first, second);
  assertEquals(first.maturity.level, "L1");
  assertEquals(first.dimensions.find((item) => item.key === "verification")?.score, null);
});

Deno.test("requires three iterated and verified tasks for L3", () => {
  const two = [task(1), task(2)];
  const three = [...two, task(3)];
  assertEquals(scoreCollaboration(two, evidenceFor(two)).maturity.level, "L2");
  assertEquals(scoreCollaboration(three, evidenceFor(three)).maturity.level, "L3");
});

Deno.test("requires five qualified tasks and two reusable assets for L4", () => {
  const tasks = [
    task(1, {
      hasReusableAsset: true,
      evidenceIds: ["intent-1", "iteration-1", "verification-1", "assetization-1"],
    }),
    task(2, {
      hasReusableAsset: true,
      evidenceIds: ["intent-2", "iteration-2", "verification-2", "assetization-2"],
    }),
    task(3),
    task(4),
    task(5),
  ];
  assertEquals(scoreCollaboration(tasks, evidenceFor(tasks)).maturity.level, "L4");
  tasks[1].hasReusableAsset = false;
  tasks[1].evidenceIds = tasks[1].evidenceIds.filter((id) => !id.startsWith("assetization-"));
  assertEquals(scoreCollaboration(tasks, evidenceFor(tasks)).maturity.level, "L3");
});

Deno.test("keyword matches alone cannot prove verification or reusable assets", () => {
  const tasks = [task(1, {
    hasIteration: false,
    hasVerification: true,
    hasReusableAsset: true,
    evidenceIds: ["intent-1", "verification-1", "assetization-1"],
  })];
  const evidence = [
    typedEvidence("intent-1", "intent", 0.9, ["user_message"]),
    typedEvidence("verification-1", "verification", 0.95, ["keyword_match"]),
    typedEvidence("assetization-1", "assetization", 0.95, ["keyword_match"]),
  ];

  const result = scoreCollaboration(tasks, evidence);

  assertEquals(result.maturity.level, "L1");
  assertEquals(result.dimensions.find((item) => item.key === "verification")?.score, null);
  assertEquals(result.dimensions.find((item) => item.key === "assetization")?.score, null);
  assert(dimensionReason(result, "verification").includes("关键词"));
});

Deno.test("medium-confidence evidence needs a second independent source for L3", () => {
  const tasks = [task(1), task(2), task(3)];
  const singleSource = tasks.flatMap((item) => [
    typedEvidence(`intent-${item.id}`, "intent", 0.9, ["user_message"]),
    typedEvidence(`iteration-${item.id}`, "iteration", 0.9, [
      "semantic_round",
      "user_message",
    ]),
    typedEvidence(`verification-${item.id}`, "verification", 0.7, ["tool_action"]),
  ]);
  tasks.forEach((item) => {
    item.evidenceIds = [
      `intent-${item.id}`,
      `iteration-${item.id}`,
      `verification-${item.id}`,
    ];
  });

  const candidate = scoreCollaboration(tasks, singleSource);
  assertEquals(candidate.maturity.level, "L2");
  assert(dimensionReason(candidate, "verification").includes("第二类独立证据"));

  const corroborated = singleSource.map((item) =>
    item.type === "verification"
      ? typedEvidence(item.id, item.type, item.confidence, ["tool_action", "tool_result"])
      : item
  );
  assertEquals(scoreCollaboration(tasks, corroborated).maturity.level, "L3");
});

Deno.test("gate-ready evidence keeps a dimension available when weaker candidates also exist", () => {
  const tasks = [task(1, {
    evidenceIds: ["verification-strong", "verification-candidate"],
  })];
  const evidence = [
    typedEvidence("verification-strong", "verification", 0.9, [
      "tool_action",
      "assistant_result",
    ]),
    typedEvidence("verification-candidate", "verification", 0.7, ["tool_action"]),
  ];

  const result = scoreCollaboration(tasks, evidence);
  const verification = result.dimensions.find((item) => item.key === "verification");

  assertEquals(verification?.status, "available");
  assertEquals(verification?.reason, undefined);
});

Deno.test("partial evidence degrades only its affected dimension", () => {
  const tasks = [task(1, {
    evidenceIds: ["intent-1", "iteration-1", "verification-1"],
  })];
  const evidence = [
    typedEvidence("intent-1", "intent", 0.9, ["user_message"]),
    typedEvidence("iteration-1", "iteration", 0.9, ["semantic_round"], "partial"),
    typedEvidence("verification-1", "verification", 0.9, ["tool_action", "tool_result"]),
  ];

  const result = scoreCollaboration(tasks, evidence);

  assertEquals(result.dimensions.find((item) => item.key === "iteration")?.score, null);
  assert(dimensionReason(result, "iteration").includes("部分"));
  assertEquals(result.dimensions.find((item) => item.key === "verification")?.score, 80);
  assertEquals(dimensionReason(result, "verification"), "");
});

Deno.test("partial AI coverage excludes only uncovered tasks from semantic maturity gates", () => {
  const tasks = [task(1), task(2), task(3)];
  const scoreWithContext = scoreCollaboration as unknown as (
    tasks: TaskSummary[],
    evidence: Evidence[],
    context: { partialAnalysis: boolean; analyzedTaskIds: string[] },
  ) => ReturnType<typeof scoreCollaboration>;

  const result = scoreWithContext(tasks, evidenceFor(tasks), {
    partialAnalysis: true,
    analyzedTaskIds: ["task-1", "task-2"],
  });

  assertEquals(result.maturity.level, "L2");
  assert(result.maturity.reason.includes("2 / 3"));
  assert(dimensionReason(result, "iteration").includes("部分任务"));
  assert(dimensionReason(result, "verification").includes("部分任务"));
  assertEquals(dimensionReason(result, "intent"), "");
});
