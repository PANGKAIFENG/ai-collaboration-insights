import { analyzeDeterministically } from "../analysis/deterministic.ts";
import { type AnalyzerRunner, runCodexAnalysis } from "../analysis/codex_analyzer.ts";
import { buildAnalysisDetails, buildAnalysisPackage } from "../analysis/redaction.ts";
import { scanCodexWindow } from "../codex/adapter.ts";
import {
  acquireReportLock,
  atomicWriteJson,
  atomicWriteText,
  readJson,
  sha256,
} from "../core/io.ts";
import { localReportDate, missingClosedReportDates, reportDateWindow } from "../core/time.ts";
import {
  APP_VERSION,
  type CoachSuggestion,
  type DailyReport,
  type Manifest,
  REPORT_SCHEMA_VERSION,
} from "../core/types.ts";
import { indexEntries, renderDailyReport, renderReportIndex } from "./renderer.ts";
import { validateDailyReport } from "./schema.ts";
import { readConsent } from "../runtime/commands.ts";
import { ensureOwnedDataDirectory } from "../runtime/scheduler.ts";

export interface GenerateReportOptions {
  date: string;
  timeZone: string;
  sourceRoot: string;
  dataDir: string;
  noAi: boolean;
  generationReason: DailyReport["generationReason"];
  now?: Date;
  beforePublish?: () => Promise<void>;
  analyzerRunner?: AnalyzerRunner;
}

export interface GenerateReportResult {
  status: "generated" | "up_to_date";
  report: DailyReport;
  htmlPath: string;
}

export interface GenerateScheduledReportsOptions {
  now?: Date;
  timeZone: string;
  sourceRoot: string;
  dataDir: string;
  noAi: boolean;
  catchUpLimit?: number;
  analyzerRunner?: AnalyzerRunner;
}

function emptyManifest(): Manifest {
  return { schemaVersion: "1", reports: {} };
}

function suggestions(report: Pick<DailyReport, "tasks" | "evidence">): CoachSuggestion[] {
  const result: CoachSuggestion[] = [];
  const firstEvidence = report.evidence[0]?.id;
  const unverified = report.tasks.find((task) => !task.hasVerification);
  if (unverified && firstEvidence) {
    result.push({
      issue: "验证闭环不足",
      evidenceId: unverified.evidenceIds[0] ?? firstEvidence,
      action: `为“${unverified.name}”补一个可执行检查，并让 Codex 记录结果。`,
      verification: "下一份日报应出现 verification 证据和明确通过/失败状态。",
    });
  }
  const notIterated = report.tasks.find((task) => !task.hasIteration);
  if (notIterated && firstEvidence && result.length < 3) {
    result.push({
      issue: "协作停留在单轮回答",
      evidenceId: notIterated.evidenceIds[0] ?? firstEvidence,
      action: "在接受结果前，要求 Codex 先验证假设，再根据结果迭代一次。",
      verification: "同一任务应同时出现 iteration 与 verification 证据。",
    });
  }
  if (
    report.tasks.length >= 2 && !report.tasks.some((task) => task.hasReusableAsset) &&
    firstEvidence && result.length < 3
  ) {
    result.push({
      issue: "可复用资产信号不足",
      evidenceId: firstEvidence,
      action: "把今天重复出现的做法整理成测试、脚本、模板或 Skill。",
      verification: "后续任务能够引用该资产，而不是重新描述整套做法。",
    });
  }
  return result.slice(0, 3);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

async function publishDateDirectory(
  reportsDir: string,
  date: string,
  report: DailyReport,
  html: string,
  beforePublish?: () => Promise<void>,
): Promise<void> {
  const target = `${reportsDir}/${date}`;
  const temporary = `${reportsDir}/.${date}.tmp-${crypto.randomUUID()}`;
  const backup = `${reportsDir}/.${date}.backup-${crypto.randomUUID()}`;
  await Deno.mkdir(temporary, { mode: 0o700 });
  let backedUp = false;
  try {
    await atomicWriteJson(`${temporary}/report.json`, report);
    await atomicWriteText(`${temporary}/index.html`, html);
    validateDailyReport(JSON.parse(await Deno.readTextFile(`${temporary}/report.json`)));
    if (
      !await Deno.readTextFile(`${temporary}/index.html`).then((value) =>
        value.startsWith("<!doctype html>")
      )
    ) {
      throw new Error("invalid rendered report");
    }
    if (beforePublish) await beforePublish();
    if (await pathExists(target)) {
      await Deno.rename(target, backup);
      backedUp = true;
    }
    try {
      await Deno.rename(temporary, target);
    } catch (error) {
      if (backedUp) await Deno.rename(backup, target);
      throw error;
    }
    if (backedUp) await Deno.remove(backup, { recursive: true });
  } catch (error) {
    if (await pathExists(temporary)) await Deno.remove(temporary, { recursive: true });
    throw error;
  }
}

export async function generateDailyReport(
  options: GenerateReportOptions,
): Promise<GenerateReportResult> {
  if (!options.dataDir.startsWith("/")) throw new Error("dataDir must be absolute");
  await ensureOwnedDataDirectory(options.dataDir);
  const reportsDir = `${options.dataDir}/reports`;
  await Deno.mkdir(reportsDir, { recursive: true, mode: 0o700 });
  await Deno.mkdir(`${options.dataDir}/tmp`, { recursive: true, mode: 0o700 });
  const release = await acquireReportLock(`${options.dataDir}/report.lock`, APP_VERSION);
  try {
    const window = reportDateWindow(options.date, options.timeZone);
    const scan = await scanCodexWindow({ root: options.sourceRoot, window });
    const manifestFile = `${options.dataDir}/manifest.json`;
    const manifest = await readJson<Manifest>(manifestFile, emptyManifest());
    const current = manifest.reports[options.date];
    const reportFile = `${reportsDir}/${options.date}/report.json`;
    const consent = await readConsent(`${options.dataDir}/consent.json`);
    if (current?.sourceFingerprint === scan.fingerprint && await pathExists(reportFile)) {
      const existing = validateDailyReport(JSON.parse(await Deno.readTextFile(reportFile)));
      const analysisIsCurrent = options.noAi
        ? existing.analysisStatus.status === "disabled"
        : consent.granted
        ? existing.analysisStatus.mode === "ai_enriched" &&
          existing.analysisStatus.status === "complete"
        : existing.analysisStatus.status === "not_consented";
      if (analysisIsCurrent) {
        return {
          status: "up_to_date",
          report: existing,
          htmlPath: `${reportsDir}/${options.date}/index.html`,
        };
      }
    }

    const deterministic = analyzeDeterministically(scan.events, window);
    const revision = (current?.revision ?? 0) + 1;
    const reportId = await sha256(`${options.date}:${revision}:${scan.fingerprint}`);
    const partial = scan.diagnostics.skippedLines > 0 || scan.diagnostics.unknownEvents > 0 ||
      scan.diagnostics.truncated;
    const report: DailyReport = {
      schemaVersion: REPORT_SCHEMA_VERSION,
      reportId,
      window,
      revision,
      generationReason: options.generationReason,
      generatedAt: (options.now ?? new Date()).toISOString(),
      completeness: {
        status: scan.events.length === 0 ? "no_data" : partial ? "partial" : "complete",
        parsedEvents: scan.events.length,
        skippedLines: scan.diagnostics.skippedLines,
        unknownEvents: scan.diagnostics.unknownEvents,
        notes: scan.diagnostics.truncated ? ["事件数量达到安全上限"] : [],
      },
      usageMetrics: deterministic.usageMetrics,
      usageDistributions: deterministic.usageDistributions,
      workBlocks: deterministic.workBlocks,
      tasks: deterministic.tasks,
      taskRelations: deterministic.taskRelations,
      evidencePackets: deterministic.evidencePackets,
      score: { total: deterministic.score.total, dimensions: deterministic.score.dimensions },
      maturity: deterministic.score.maturity,
      evidence: deterministic.evidence,
      sessionInsights: [],
      coachSuggestions: [],
      analysisStatus: {
        mode: "deterministic",
        status: options.noAi ? "disabled" : "not_consented",
      },
      provenance: {
        appVersion: APP_VERSION,
        parserVersion: "1",
        analyzerVersion: "2",
        rubricVersion: "1",
        rendererVersion: "1",
        sourceFingerprint: scan.fingerprint,
      },
    };
    report.coachSuggestions = suggestions(report);
    if (!options.noAi) {
      const analysis = await runCodexAnalysis({
        input: buildAnalysisPackage(report),
        detailProvider: (taskIds) => buildAnalysisDetails(report, scan.events, taskIds),
        consent,
        runner: options.analyzerRunner,
      });
      if (
        (analysis.status === "complete" || analysis.status === "partial") &&
        analysis.enrichment
      ) {
        const enrichmentById = new Map(analysis.enrichment.tasks.map((item) => [item.id, item]));
        report.tasks = report.tasks.map((task) => {
          const enrichment = enrichmentById.get(task.id);
          if (!enrichment) return task;
          return {
            ...task,
            name: enrichment.name,
            outcome: enrichment.outcome,
            verification: task.hasVerification
              ? "verified"
              : enrichment.verificationStatus === "not_observed"
              ? "not_observed"
              : "attempted",
            confidence: Math.max(task.confidence, enrichment.confidence),
          };
        });
        report.sessionInsights = analysis.enrichment.insights;
        if (analysis.enrichment.suggestions.length > 0) {
          report.coachSuggestions = analysis.enrichment.suggestions;
        }
        report.analysisStatus = {
          mode: "ai_enriched",
          status: analysis.status,
          reason: analysis.reason,
          coverage: analysis.coverage,
        };
      } else if (analysis.status === "degraded") {
        report.analysisStatus = {
          mode: "deterministic",
          status: "degraded",
          reason: analysis.reason ?? "Codex analysis failed",
        };
      } else {
        report.analysisStatus = {
          mode: "deterministic",
          status: "not_consented",
          reason: analysis.reason,
        };
      }
    }
    validateDailyReport(report);
    const html = renderDailyReport(report);
    await publishDateDirectory(reportsDir, options.date, report, html, options.beforePublish);
    const reportDigest = await sha256(JSON.stringify(report));
    manifest.reports[options.date] = {
      date: options.date,
      revision,
      sourceFingerprint: scan.fingerprint,
      reportDigest,
      generatedAt: report.generatedAt,
    };
    await atomicWriteJson(manifestFile, manifest);
    await atomicWriteText(
      `${reportsDir}/index.html`,
      renderReportIndex(indexEntries(manifest, report)),
    );
    return { status: "generated", report, htmlPath: `${reportsDir}/${options.date}/index.html` };
  } finally {
    await release();
  }
}

export async function generateScheduledReports(
  options: GenerateScheduledReportsOptions,
): Promise<GenerateReportResult[]> {
  const now = options.now ?? new Date();
  const manifest = await readJson<Manifest>(`${options.dataDir}/manifest.json`, emptyManifest());
  const latest = localReportDate(now, options.timeZone);
  const missing = missingClosedReportDates(
    now,
    options.timeZone,
    new Set(Object.keys(manifest.reports)),
    options.catchUpLimit ?? 7,
  );
  const dates = missing.includes(latest) ? missing : [...missing, latest];
  const results: GenerateReportResult[] = [];
  for (const date of dates) {
    results.push(
      await generateDailyReport({
        date,
        timeZone: options.timeZone,
        sourceRoot: options.sourceRoot,
        dataDir: options.dataDir,
        noAi: options.noAi,
        generationReason: date === latest ? "scheduled" : "catch_up",
        now,
        analyzerRunner: options.analyzerRunner,
      }),
    );
  }
  return results;
}
