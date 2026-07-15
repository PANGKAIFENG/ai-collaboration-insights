import { assertEquals } from "../_assert.ts";
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
    hasIteration: true,
    hasVerification: true,
    hasReusableAsset: false,
    ...options,
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
  assertEquals(scoreCollaboration(tasks, evidenceFor(tasks)).maturity.level, "L3");
});
