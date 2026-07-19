import { assert, assertEquals } from "../_assert.ts";
import { renderDailyReport, renderReportIndex } from "../../packages/report/renderer.ts";
import { APP_VERSION, type DailyReport, REPORT_SCHEMA_VERSION } from "../../packages/core/types.ts";
import { reportDateWindow } from "../../packages/core/time.ts";

function syntheticReport(): DailyReport {
  const keyRounds = Array.from({ length: 6 }, (_, index) => ({
    id: `round-${index + 1}`,
    taskId: "task-1",
    sequence: index + 1,
    start: `2026-07-14T11:${String(index).padStart(2, "0")}:00.000Z`,
    end: `2026-07-14T11:${String(index + 1).padStart(2, "0")}:00.000Z`,
    trigger: index === 0 ? "intent" as const : "user_feedback" as const,
    status: index === 0 ? "baseline" as const : "effective" as const,
    eventIds: [`round-event-${index + 1}`],
    intentEventIds: [],
    attemptEventIds: [],
    feedbackEventIds: [],
    adjustmentEventIds: [],
    resultEventIds: [],
    lifecycleEventIds: [],
  }));
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
      subagentInterrupted: 0,
      activeMinutes: 12,
      tokens: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
    },
    usageDistributions: {
      messagesPerSession: { sampleSize: 1, mean: 2, median: 2, p90: 2 },
      toolCallsPerSession: { sampleSize: 1, mean: 1, median: 1, p90: 1 },
      tokensPerSession: { sampleSize: 1, mean: 120, median: 120, p90: 120 },
      activeMinutesPerSession: { sampleSize: 1, mean: 12, median: 12, p90: 12 },
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
      sourceSessionIds: ["session-1"],
      sourceTurnIds: ["turn-1"],
      relationIds: [],
      semanticRoundCount: 1,
      effectiveRoundCount: 0,
      keyRounds,
      hasIteration: true,
      hasVerification: false,
      hasReusableAsset: false,
    }],
    taskRelations: [],
    evidencePackets: [],
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
      label: '<img src=x onerror="evidence()">',
      eventIds: ["event-1"],
      confidence: 0.8,
    }],
    sessionInsights: [],
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
  assert(!html.includes("frame-ancestors"));
  assert(!/<script\b/i.test(html));
  assert(!/<form\b/i.test(html));
  assert(!/https?:\/\//i.test(html));
  assert(/footer\{[^}]*overflow-wrap:anywhere/.test(html));
  assert(html.includes("中位 2"));
  assert(!html.includes("每条消息 Token"));
});

Deno.test("keeps long task outcomes inside the mobile viewport", () => {
  const report = syntheticReport();
  report.tasks[0].outcome = `/synthetic/${"unbroken-segment".repeat(30)}`;

  const html = renderDailyReport(report);

  assert(/\.task-main\{[^}]*min-width:0/.test(html));
  assert(/\.task-main>p\{[^}]*overflow-wrap:anywhere/.test(html));
  assert(
    /@media\(max-width:760px\)\{[\s\S]*?\.task-row\{grid-template-columns:minmax\(0,1fr\)/.test(
      html,
    ),
  );
});

Deno.test("escapes every model and log derived string as text", () => {
  const html = renderDailyReport(syntheticReport());
  assert(!html.includes('<script>alert("x")</script>'));
  assert(!html.includes('<img src=x onerror="alert(1)">'));
  assert(html.includes("&lt;script&gt;"));
  assert(html.includes("&lt;img"));
  assert(!html.includes('<img src=x onerror="evidence()">'));
});

Deno.test("renders quality coverage task status evidence and at most five key rounds", () => {
  const report = syntheticReport() as unknown as DailyReport & {
    tasks: Array<DailyReport["tasks"][number] & { analysisStatus?: string }>;
  };
  report.analysisStatus = {
    mode: "ai_enriched",
    status: "partial",
    reason: "one synthetic task timed out",
    coverage: { totalTasks: 2, analyzedTasks: 1, detailTasks: 1 },
  };
  report.tasks[0].analysisStatus = "analyzed";
  const html = renderDailyReport(report);

  assert(html.indexOf("数据质量") < html.indexOf("当日协作层级"));
  assert(html.includes("50%"));
  assert(html.includes("AI 已分析"));
  assert(html.includes("关键语义轮次"));
  assert(html.includes("证据详情"));
  assertEquals((html.match(/data-round=/g) ?? []).length, 5);
  assert(html.includes("one synthetic task timed out"));
});

Deno.test("renders structured evidence result status without raw tool output", () => {
  const report = syntheticReport();
  report.evidencePackets = [{
    schemaVersion: "1",
    taskId: "task-1",
    anchors: [{
      eventId: "verification-result",
      sourceTurnId: "turn-1",
      category: "verification",
      timestamp: "2026-07-14T11:05:00.000Z",
      kind: "tool_result",
      resultStatus: "error",
    }],
    rounds: [],
    coverage: {
      requiredCategories: ["intent", "outcome", "verification", "asset", "delegation"],
      presentCategories: ["verification"],
      missingCategories: ["intent", "outcome", "asset", "delegation"],
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
  }];

  const html = renderDailyReport(report);

  assert(html.includes("验证结果：失败"));
  assert(!html.includes("raw tool output"));
});

Deno.test("does not render an ordinary outcome status as a verification result", () => {
  const report = syntheticReport();
  report.evidencePackets = [{
    schemaVersion: "1",
    taskId: "task-1",
    anchors: [{
      eventId: "ordinary-outcome",
      sourceTurnId: "turn-1",
      category: "outcome",
      timestamp: "2026-07-14T11:05:00.000Z",
      kind: "message",
      resultStatus: "success",
    }],
    rounds: [],
    coverage: {
      requiredCategories: ["intent", "outcome", "verification", "asset", "delegation"],
      presentCategories: ["outcome"],
      missingCategories: ["intent", "verification", "asset", "delegation"],
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
  }];

  const html = renderDailyReport(report);

  assert(!html.includes("验证结果：通过"));
});

Deno.test("renders an explicit failed task verification status", () => {
  const report = syntheticReport();
  report.tasks[0].verification = "failed" as never;

  const html = renderDailyReport(report);

  assert(html.includes("验证失败"));
});

Deno.test("does not interpolate an unsafe dimension score into inline styles", () => {
  const report = syntheticReport();
  report.score.dimensions[0].score = '100";background:url(evil)' as unknown as number;

  const html = renderDailyReport(report);

  assert(!html.includes("background:url(evil)"));
  assert(html.includes('style="width:0%"'));
  assert(html.includes("不可用"));
});

Deno.test("renders a controlled relative-link history index", () => {
  const html = renderReportIndex([{ date: "2026-07-15", level: "L2", score: 70 }]);
  assert(html.includes('href="2026-07-15/index.html"'));
  assert(!/https?:\/\//i.test(html));
});
