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
      activeMinutes: 0,
      tokens: {},
    },
    workBlocks: [],
    tasks: [],
    score: { total: null, dimensions: [] },
    maturity: { level: "unavailable", reason: "No task evidence" },
    evidence: [],
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
