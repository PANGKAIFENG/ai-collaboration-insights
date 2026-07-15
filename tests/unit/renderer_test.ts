import { assert } from "../_assert.ts";
import { renderDailyReport, renderReportIndex } from "../../packages/report/renderer.ts";
import { APP_VERSION, type DailyReport, REPORT_SCHEMA_VERSION } from "../../packages/core/types.ts";
import { reportDateWindow } from "../../packages/core/time.ts";

function syntheticReport(): DailyReport {
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    reportId: "synthetic-report",
    window: reportDateWindow("2026-07-15", "Asia/Shanghai"),
    revision: 1,
    generationReason: "manual",
    generatedAt: "2026-07-15T11:01:00.000Z",
    completeness: {
      status: "partial",
      parsedEvents: 4,
      skippedLines: 1,
      unknownEvents: 0,
      notes: [],
    },
    usageMetrics: {
      sessions: 1,
      messages: 2,
      toolCalls: 1,
      skillCalls: 0,
      subagentCalls: 0,
      activeMinutes: 12,
      tokens: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
    },
    workBlocks: [{
      id: "block-1",
      start: "2026-07-14T11:00:00.000Z",
      end: "2026-07-14T11:12:00.000Z",
      activeMinutes: 12,
      projectLabel: "alpha",
      eventIds: ["event-1"],
    }],
    tasks: [{
      id: "task-1",
      name: '<script>alert("x")</script>',
      projectLabel: "alpha",
      start: "2026-07-14T11:00:00.000Z",
      end: "2026-07-14T11:12:00.000Z",
      activeMinutes: 12,
      outcome: '<img src=x onerror="alert(1)">',
      verification: "not_observed",
      confidence: 0.75,
      evidenceIds: ["evidence-1"],
      hasIteration: true,
      hasVerification: false,
      hasReusableAsset: false,
    }],
    score: {
      total: 70,
      dimensions: [{
        key: "intent",
        label: "目标表达",
        score: 70,
        confidence: 0.8,
        evidenceIds: ["evidence-1"],
      }],
    },
    maturity: { level: "L2", reason: "Observed iteration" },
    evidence: [{
      id: "evidence-1",
      type: "intent",
      label: "User goal",
      eventIds: ["event-1"],
      confidence: 0.8,
    }],
    coachSuggestions: [{
      issue: "缺少验证",
      evidenceId: "evidence-1",
      action: "运行测试",
      verification: "记录通过结果",
    }],
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

Deno.test("renders data then outcomes then coaching with a strict static CSP", () => {
  const html = renderDailyReport(syntheticReport());
  const data = html.indexOf("数据与层级");
  const outcomes = html.indexOf("工作成果");
  const coaching = html.indexOf("教练建议");
  assert(data > 0 && data < outcomes && outcomes < coaching);
  assert(html.includes("default-src 'none'"));
  assert(!/<script\b/i.test(html));
  assert(!/<form\b/i.test(html));
  assert(!/https?:\/\//i.test(html));
});

Deno.test("escapes every model and log derived string as text", () => {
  const html = renderDailyReport(syntheticReport());
  assert(!html.includes('<script>alert("x")</script>'));
  assert(!html.includes('<img src=x onerror="alert(1)">'));
  assert(html.includes("&lt;script&gt;"));
  assert(html.includes("&lt;img"));
});

Deno.test("renders a controlled relative-link history index", () => {
  const html = renderReportIndex([{ date: "2026-07-15", level: "L2", score: 70 }]);
  assert(html.includes('href="2026-07-15/index.html"'));
  assert(!/https?:\/\//i.test(html));
});
