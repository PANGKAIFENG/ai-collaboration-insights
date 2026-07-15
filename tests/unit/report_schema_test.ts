import { assertEquals, assertRejects } from "../_assert.ts";
import { validateDailyReport } from "../../packages/report/schema.ts";
import { APP_VERSION, type DailyReport, REPORT_SCHEMA_VERSION } from "../../packages/core/types.ts";
import { reportDateWindow } from "../../packages/core/time.ts";

function report(): DailyReport {
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    reportId: "report-synthetic",
    window: reportDateWindow("2026-07-15", "Asia/Shanghai"),
    revision: 1,
    generationReason: "manual",
    generatedAt: "2026-07-15T11:01:00.000Z",
    completeness: {
      status: "no_data",
      parsedEvents: 0,
      skippedLines: 0,
      unknownEvents: 0,
      notes: [],
    },
    usageMetrics: {
      sessions: 0,
      messages: 0,
      toolCalls: 0,
      skillCalls: 0,
      subagentCalls: 0,
      subagentInterrupted: 0,
      activeMinutes: 0,
      tokens: {},
    },
    usageDistributions: {
      messagesPerSession: { sampleSize: 0, mean: 0, median: 0, p90: 0 },
      toolCallsPerSession: { sampleSize: 0, mean: 0, median: 0, p90: 0 },
      tokensPerSession: { sampleSize: 0, mean: 0, median: 0, p90: 0 },
      activeMinutesPerSession: { sampleSize: 0, mean: 0, median: 0, p90: 0 },
    },
    workBlocks: [],
    tasks: [],
    taskRelations: [],
    evidencePackets: [],
    score: { total: null, dimensions: [] },
    maturity: { level: "unavailable", reason: "No task evidence" },
    evidence: [],
    sessionInsights: [],
    coachSuggestions: [],
    analysisStatus: { mode: "deterministic", status: "disabled" },
    provenance: {
      appVersion: APP_VERSION,
      parserVersion: "1",
      analyzerVersion: "1",
      rubricVersion: "1",
      rendererVersion: "1",
      sourceFingerprint: "abc",
    },
  };
}

Deno.test("accepts a complete schema-valid report", () => {
  const value = report();
  assertEquals(validateDailyReport(value), value);
});

Deno.test("rejects more than three coach suggestions", async () => {
  const value = report();
  value.coachSuggestions = Array.from({ length: 4 }, (_, index) => ({
    issue: `Issue ${index}`,
    evidenceId: `evidence-${index}`,
    action: "Act",
    verification: "Verify",
  }));
  await assertRejects(() => Promise.resolve(validateDailyReport(value)), /at most 3/);
});

Deno.test("migrates a v1 report without session insights", () => {
  const value = report() as unknown as Record<string, unknown>;
  delete value.sessionInsights;
  value.tasks = [{
    id: "legacy-task",
    name: "Legacy task",
    start: "2026-07-14T11:00:00.000Z",
    end: "2026-07-14T11:10:00.000Z",
    activeMinutes: 10,
    outcome: "Legacy outcome",
    verification: "not_observed",
    confidence: 0.7,
    evidenceIds: ["legacy-evidence"],
    sourceSessionIds: ["legacy-session"],
    relationIds: [],
    semanticRoundCount: 0,
    effectiveRoundCount: 0,
    keyRounds: [],
    hasIteration: false,
    hasVerification: false,
    hasReusableAsset: false,
  }];
  value.evidence = [{
    id: "legacy-evidence",
    type: "intent",
    label: "Legacy evidence",
    eventIds: ["legacy-event"],
    confidence: 0.7,
  }];
  value.score = {
    total: 65,
    dimensions: [{
      key: "intent",
      label: "目标表达",
      score: 65,
      confidence: 0.7,
      evidenceIds: ["legacy-evidence"],
    }],
  };
  const migrated = validateDailyReport(value);
  assertEquals(migrated.sessionInsights, []);
  assertEquals(
    (migrated.tasks[0] as unknown as { analysisStatus: string }).analysisStatus,
    "deterministic",
  );
  assertEquals(
    (migrated.evidence[0] as unknown as { availability: string }).availability,
    "complete",
  );
  assertEquals(
    (migrated.score.dimensions[0] as unknown as { status: string }).status,
    "available",
  );
});
