import type { DailyReport, Manifest } from "../core/types.ts";

const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; " +
  "form-action 'none'";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function number(value: number | undefined): string {
  return value === undefined ? "不可用" : new Intl.NumberFormat("zh-CN").format(value);
}

function dateTime(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function statusLabel(report: DailyReport): string {
  if (report.completeness.status === "no_data") return "无活动数据";
  if (report.completeness.status === "partial") return "部分数据";
  return "数据完整";
}

function analysisLabel(report: DailyReport): string {
  const labels: Record<DailyReport["analysisStatus"]["status"], string> = {
    complete: report.analysisStatus.mode === "ai_enriched" ? "AI 分析完成" : "确定性分析完成",
    partial: "AI 分析部分完成",
    disabled: "AI 分析已关闭",
    not_consented: "AI 分析未授权",
    degraded: "AI 分析已降级",
  };
  return labels[report.analysisStatus.status];
}

function metric(label: string, value: string, detail: string): string {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${
    escapeHtml(value)
  }</strong><small>${escapeHtml(detail)}</small></div>`;
}

function distributionDetail(
  value: DailyReport["usageDistributions"][keyof DailyReport["usageDistributions"]],
): string {
  return `均值 ${number(value.mean)} · 中位 ${number(value.median)} · n=${value.sampleSize}`;
}

function percent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function scoreValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, value))
    : null;
}

function taskAnalysisLabel(
  task: DailyReport["tasks"][number],
  report: DailyReport,
): string {
  const status = task.analysisStatus ?? "deterministic";
  if (status === "analyzed") return "AI 已分析";
  if (status === "not_analyzed") return "AI 未覆盖";
  if (status === "degraded") return "分析已降级";
  return report.analysisStatus.status === "not_consented" ? "确定性候选" : "确定性分析";
}

function verificationLabel(value: DailyReport["tasks"][number]["verification"]): string {
  if (value === "verified") return "已验证";
  if (value === "attempted") return "已尝试验证";
  return "未观察到验证";
}

function roundLabel(round: DailyReport["tasks"][number]["keyRounds"][number]): string {
  const trigger = {
    intent: "目标建立",
    user_feedback: "用户反馈",
    verification_feedback: "验证反馈",
    approach_change: "方案调整",
    continuation: "继续推进",
  }[round.trigger];
  const status = {
    baseline: "基线",
    effective: "有效推进",
    ineffective: "无效循环",
    pending: "待观察",
  }[round.status];
  return `${trigger} · ${status}`;
}

export function renderDailyReport(report: DailyReport): string {
  const timeZone = report.window.timeZone;
  const evidenceById = new Map(report.evidence.map((item) => [item.id, item]));
  const coverage = report.analysisStatus.coverage;
  const coverageRatio = coverage && coverage.totalTasks > 0
    ? coverage.analyzedTasks / coverage.totalTasks
    : undefined;
  const completenessReasons = [
    report.completeness.skippedLines > 0
      ? `${number(report.completeness.skippedLines)} 条记录跳过`
      : undefined,
    report.completeness.unknownEvents > 0
      ? `${number(report.completeness.unknownEvents)} 个未知事件`
      : undefined,
    ...report.completeness.notes,
  ].filter((item): item is string => Boolean(item));
  const degradedDimensions = report.score.dimensions.filter((item) =>
    item.status === "degraded" || item.status === "candidate"
  );
  const taskRows = report.tasks.length === 0
    ? `<p class="empty">该窗口没有足够信息形成任务候选。</p>`
    : report.tasks.map((task) => {
      const rounds = task.keyRounds.slice(0, 5).map((round) => `
        <li data-round="${escapeHtml(round.id)}"><div><b>R${round.sequence}</b><span>${
        escapeHtml(roundLabel(round))
      }</span></div><small>${escapeHtml(dateTime(round.start, timeZone))} → ${
        escapeHtml(dateTime(round.end, timeZone))
      } · ${round.eventIds.length} 个事件${
        round.loopReason ? " · 重复动作或反馈" : ""
      }</small></li>`).join("");
      const evidenceRows = task.evidenceIds.slice(0, 12).map((id) => {
        const item = evidenceById.get(id);
        return `<li><code>${escapeHtml(id)}</code><span>${
          escapeHtml(item?.label ?? "证据摘要不可用")
        }</span><small>${item ? `${percent(item.confidence)} 置信` : "引用保留"}</small></li>`;
      }).join("");
      const insightRows = report.sessionInsights.filter((insight) =>
        task.sourceSessionIds.includes(insight.sessionRef)
      ).slice(0, 2).map((insight) =>
        `<li><span class="inference">AI 推断</span><b>${escapeHtml(insight.direction)}</b><p>${
          escapeHtml(insight.conclusion)
        }</p><small>${percent(insight.confidence)} 置信 · 证据 ${
          escapeHtml(insight.evidenceIds.join(" · "))
        }</small></li>`
      ).join("");
      return `
      <article class="task-row">
        <div class="task-time">${escapeHtml(dateTime(task.start, timeZone))}<br>${
        escapeHtml(dateTime(task.end, timeZone))
      }</div>
        <div class="task-main">
          <div class="task-heading"><h3>${escapeHtml(task.name)}</h3><span class="confidence">${
        Math.round(task.confidence * 100)
      }% 置信</span></div>
          <p>${escapeHtml(task.outcome)}</p>
          <div class="task-meta"><span>${escapeHtml(task.projectLabel ?? "未知项目")}</span><span>${
        number(task.activeMinutes)
      } 分钟</span><span>${
        escapeHtml(verificationLabel(task.verification))
      }</span><span>${task.sourceSessionIds.length} 个会话 · ${task.semanticRoundCount} 个语义轮次 · ${task.relationIds.length} 条关系</span><span class="analysis-tag">${
        escapeHtml(taskAnalysisLabel(task, report))
      }</span></div>
          <div class="evidence-line">证据 ${
        escapeHtml(task.evidenceIds.join(" · ") || "不足")
      }</div>
          <div class="task-details">
            <details><summary>关键语义轮次 <span>${
        Math.min(task.keyRounds.length, 5)
      } / ${task.semanticRoundCount}</span></summary><ol class="round-list">${
        rounds || "<li>暂无可展示轮次</li>"
      }</ol></details>
            <details><summary>证据详情 <span>${task.evidenceIds.length}</span></summary><ul class="evidence-list">${
        evidenceRows || "<li>暂无可核对证据</li>"
      }</ul></details>
            ${
        insightRows
          ? `<details><summary>会话洞察 <span>AI 推断</span></summary><ul class="insight-list">${insightRows}</ul></details>`
          : ""
      }
          </div>
        </div>
      </article>`;
    }).join("");

  const dimensionRows = report.score.dimensions.length === 0
    ? `<p class="empty">证据不足，五维评分暂不可用。</p>`
    : report.score.dimensions.map((dimension) => {
      const safeScore = scoreValue(dimension.score);
      return `
      <div class="dimension">
        <span>${escapeHtml(dimension.label)}${
        dimension.status === "candidate" ? ' <i class="candidate">候选</i>' : ""
      }</span>
        <div class="track"><i style="width:${safeScore ?? 0}%"></i></div>
        <strong>${safeScore === null ? "不可用" : safeScore}</strong>
        ${dimension.reason ? `<small>${escapeHtml(dimension.reason)}</small>` : ""}
      </div>`;
    }).join("");

  const suggestions = report.coachSuggestions.length === 0
    ? `<p class="empty">当前没有足够证据生成可靠建议。继续完成任务并记录验证结果。</p>`
    : report.coachSuggestions.map((suggestion, index) => `
      <article class="coach-row">
        <div class="coach-number">0${index + 1}</div>
        <div><h3>${escapeHtml(suggestion.issue)}</h3><p><b>下一次行动</b> ${
      escapeHtml(suggestion.action)
    }</p><p><b>验证方式</b> ${escapeHtml(suggestion.verification)}</p><small>证据 ${
      escapeHtml(suggestion.evidenceId)
    }</small></div>
      </article>`).join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${CSP}">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(report.window.date)} · AI 协作日报</title>
  <style>
    :root{--paper:#f7f8f6;--ink:#121613;--muted:#626a64;--line:#cfd5d0;--panel:#fff;--signal:#087e6b;--warn:#b44728;--soft:#e8eeea}
    *{box-sizing:border-box}html{background:var(--paper);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;letter-spacing:0}body{margin:0;min-width:280px}main{width:min(1180px,calc(100% - 48px));margin:0 auto;padding:28px 0 80px}
    header{border-top:6px solid var(--ink);border-bottom:1px solid var(--ink);padding:22px 0 18px;display:grid;grid-template-columns:1fr auto;gap:24px;align-items:end}.kicker{font:700 12px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase;color:var(--signal)}h1{font:600 clamp(30px,5vw,58px)/1.02 "Iowan Old Style","Palatino Linotype",serif;margin:8px 0 0}.header-meta{text-align:right;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted)}
    .statusbar{display:flex;gap:8px;flex-wrap:wrap;padding:13px 0;border-bottom:1px solid var(--line)}.status{border:1px solid var(--line);padding:5px 8px;font-size:12px;background:var(--panel)}.status.warn{color:var(--warn);border-color:#d9aa9b}
    section{padding:42px 0;border-bottom:1px solid var(--ink)}.section-head{display:grid;grid-template-columns:72px 1fr;gap:16px;margin-bottom:24px}.section-no{font:700 13px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--signal)}h2{font:600 24px/1.2 "Iowan Old Style","Palatino Linotype",serif;margin:0}.section-note{color:var(--muted);font-size:13px;margin:5px 0 0}
    .quality{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border:1px solid var(--line);margin-bottom:26px;background:var(--panel)}.quality-item{padding:14px 16px;border-right:1px solid var(--line);min-height:92px}.quality-item:last-child{border-right:0}.quality-item span{display:block;font-size:11px;color:var(--muted)}.quality-item strong{display:block;margin:9px 0 5px;font:600 18px ui-monospace,SFMono-Regular,Menlo,monospace}.quality-item small{display:block;color:var(--muted);line-height:1.45;overflow-wrap:anywhere}.overview{display:grid;grid-template-columns:minmax(210px,.72fr) 1.28fr;gap:32px}.level{background:var(--ink);color:white;padding:24px;min-height:210px;display:flex;flex-direction:column;justify-content:space-between}.level small{color:#b9c4bc}.level strong{font:700 78px/.9 ui-monospace,SFMono-Regular,Menlo,monospace}.level p{margin:16px 0 0;font-size:13px;line-height:1.55;color:#d8ded9}.score{font:600 32px "Iowan Old Style","Palatino Linotype",serif;color:#71d8c0}
    .metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-top:1px solid var(--line);border-left:1px solid var(--line)}.metric{min-height:105px;padding:14px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);display:flex;flex-direction:column;justify-content:space-between;background:var(--panel)}.metric span,.metric small{font-size:11px;color:var(--muted)}.metric strong{font:600 25px ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}
    .dimensions{margin-top:24px}.dimension{display:grid;grid-template-columns:110px 1fr 54px;gap:12px;align-items:center;padding:8px 0;font-size:13px}.dimension>small{grid-column:2/-1;color:var(--warn);line-height:1.4}.dimension strong{text-align:right;font:600 13px ui-monospace,SFMono-Regular,Menlo,monospace}.candidate,.inference{font:600 9px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--warn);font-style:normal}.track{height:7px;background:var(--soft)}.track i{height:100%;display:block;background:var(--signal);max-width:100%}
    .task-row{display:grid;grid-template-columns:132px 1fr;gap:20px;padding:22px 0;border-top:1px solid var(--line)}.task-row:last-child{border-bottom:1px solid var(--line)}.task-time{font:12px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted)}.task-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.task-heading h3,.coach-row h3{font-size:16px;line-height:1.35;margin:0;overflow-wrap:anywhere}.confidence{white-space:nowrap;font:11px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--signal)}.task-main>p{margin:8px 0 12px;color:#323934;line-height:1.65}.task-meta{display:flex;flex-wrap:wrap;gap:8px 18px;font-size:12px;color:var(--muted)}.analysis-tag{color:var(--signal)}.evidence-line{margin-top:8px;font:10px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#7d857f;overflow-wrap:anywhere}.task-details{margin-top:14px;border-top:1px dashed var(--line)}details{border-bottom:1px dashed var(--line)}summary{cursor:pointer;padding:10px 0;font-size:12px;font-weight:600;list-style-position:inside}summary span{float:right;color:var(--muted);font:10px ui-monospace,SFMono-Regular,Menlo,monospace}.round-list,.evidence-list,.insight-list{list-style:none;margin:0;padding:0 0 10px}.round-list li,.evidence-list li,.insight-list li{padding:9px 0;border-top:1px solid var(--soft);font-size:12px}.round-list li div{display:flex;gap:12px}.round-list b{font:600 11px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--signal)}.round-list small,.evidence-list small,.insight-list small{display:block;margin-top:4px;color:var(--muted)}.evidence-list li{display:grid;grid-template-columns:minmax(110px,.45fr) 1fr auto;gap:10px;align-items:start}.evidence-list code{overflow-wrap:anywhere}.evidence-list small{margin:0}.insight-list b{margin-left:8px}.insight-list p{margin:6px 0}
    .coach-row{display:grid;grid-template-columns:64px 1fr;gap:18px;padding:22px 0;border-top:1px solid var(--line)}.coach-number{font:600 28px "Iowan Old Style","Palatino Linotype",serif;color:var(--warn)}.coach-row p{margin:9px 0;color:#323934;line-height:1.55}.coach-row b{display:inline-block;min-width:82px;color:var(--ink)}.coach-row small{color:var(--muted)}.empty{padding:24px 0;color:var(--muted)}footer{padding-top:20px;color:var(--muted);font:11px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}
    @media(max-width:760px){main{width:min(100% - 28px,1180px);padding-top:14px}header{grid-template-columns:1fr}.header-meta{text-align:left}.quality{grid-template-columns:1fr}.quality-item{border-right:0;border-bottom:1px solid var(--line)}.quality-item:last-child{border-bottom:0}.overview{grid-template-columns:1fr}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.section-head{grid-template-columns:42px 1fr}.task-row{grid-template-columns:1fr;gap:8px}.task-heading{display:block}.confidence{display:inline-block;margin-top:6px}.evidence-list li{grid-template-columns:1fr}.coach-row{grid-template-columns:42px 1fr}.level{min-height:180px}.level strong{font-size:64px}}
    @media(max-width:380px){.metrics{grid-template-columns:1fr}.dimension{grid-template-columns:88px minmax(70px,1fr) 44px}.task-meta{display:grid}.status{max-width:100%;overflow-wrap:anywhere}summary span{float:none;margin-left:6px}}
  </style>
</head>
<body><main>
  <header><div><div class="kicker">AI Collaboration Ledger / Daily</div><h1>${
    escapeHtml(report.window.date)
  } 日报</h1></div><div class="header-meta">${
    escapeHtml(dateTime(report.window.start, timeZone))
  } → ${escapeHtml(dateTime(report.window.end, timeZone))}<br>${
    escapeHtml(timeZone)
  } · revision ${report.revision}</div></header>
  <div class="statusbar"><span class="status ${
    report.completeness.status === "complete" ? "" : "warn"
  }">${escapeHtml(statusLabel(report))}</span><span class="status">${
    escapeHtml(analysisLabel(report))
  }</span><span class="status">${
    escapeHtml(report.generationReason)
  }</span><span class="status">生成于 ${
    escapeHtml(dateTime(report.generatedAt, timeZone))
  }</span></div>
  <section><div class="section-head"><div class="section-no">01</div><div><h2>数据与层级</h2><p class="section-note">使用强度只做事实展示，不直接提高协作评分。</p></div></div>
    <div class="quality"><div class="quality-item"><span>数据质量</span><strong>${
    escapeHtml(statusLabel(report))
  }</strong><small>${
    escapeHtml(
      completenessReasons.join(" · ") || `${number(report.completeness.parsedEvents)} 个事件已解析`,
    )
  }</small></div><div class="quality-item"><span>分析覆盖</span><strong>${
    coverageRatio === undefined ? "不适用" : percent(coverageRatio)
  }</strong><small>${
    escapeHtml(
      coverage
        ? `${coverage.analyzedTasks} / ${coverage.totalTasks} 个任务 · ${coverage.detailTasks} 个详情回读`
        : analysisLabel(report),
    )
  }</small></div><div class="quality-item"><span>评分门禁</span><strong>${
    degradedDimensions.length === 0 ? "证据可用" : `${degradedDimensions.length} 项降级`
  }</strong><small>${
    escapeHtml(
      report.analysisStatus.reason ??
        (degradedDimensions.map((item) => item.reason).filter(Boolean).join(" · ") ||
          "仅使用完整且可核对的证据"),
    )
  }</small></div></div>
    <div class="overview"><div class="level"><small>当日协作层级</small><strong>${
    escapeHtml(report.maturity.level)
  }</strong><div class="score">${
    report.score.total === null ? "不可评分" : `${report.score.total} 分`
  }</div><p>${escapeHtml(report.maturity.reason)}</p></div>
    <div><div class="metrics">${
    metric(
      "Token",
      number(report.usageMetrics.tokens.totalTokens),
      `输入 ${number(report.usageMetrics.tokens.inputTokens)} · 输出 ${
        number(report.usageMetrics.tokens.outputTokens)
      } · ${distributionDetail(report.usageDistributions.tokensPerSession)}`,
    )
  }${
    metric(
      "会话",
      number(report.usageMetrics.sessions),
      `${number(report.usageMetrics.messages)} 条消息 · ${
        distributionDetail(report.usageDistributions.messagesPerSession)
      }`,
    )
  }${
    metric(
      "工具调用",
      number(report.usageMetrics.toolCalls),
      `${number(report.usageMetrics.skillCalls)} 次 Skill · ${
        distributionDetail(report.usageDistributions.toolCallsPerSession)
      }`,
    )
  }${
    metric(
      "Subagent",
      number(report.usageMetrics.subagentCalls),
      `${number(report.usageMetrics.subagentInterrupted)} 次中断 · 按唯一运行统计`,
    )
  }${
    metric(
      "活跃时间",
      `${number(report.usageMetrics.activeMinutes)}m`,
      `${report.workBlocks.length} 个工作区间 · ${
        distributionDetail(report.usageDistributions.activeMinutesPerSession)
      }`,
    )
  }${metric("任务", number(report.tasks.length), "基于时间与项目候选")}${
    metric("跳过记录", number(report.completeness.skippedLines), "解析完整度")
  }${
    metric("未知事件", number(report.completeness.unknownEvents), "未猜测字段")
  }</div><div class="dimensions">${dimensionRows}</div></div></div>
  </section>
  <section><div class="section-head"><div class="section-no">02</div><div><h2>工作成果</h2><p class="section-note">任务、项目和成果均附置信度与证据锚点。</p></div></div>${taskRows}</section>
  <section><div class="section-head"><div class="section-no">03</div><div><h2>教练建议</h2><p class="section-note">最多三条，可在下一次协作中直接执行和验证。</p></div></div>${suggestions}</section>
  <footer>ACI ${escapeHtml(report.provenance.appVersion)} · parser ${
    escapeHtml(report.provenance.parserVersion)
  } · rubric ${escapeHtml(report.provenance.rubricVersion)} · report ${
    escapeHtml(report.reportId)
  }</footer>
</main></body></html>`;
}

export interface IndexEntry {
  date: string;
  level: string;
  score: number | null;
}

export function renderReportIndex(entries: IndexEntry[]): string {
  const rows = entries.filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry.date)).toSorted((a, b) =>
    b.date.localeCompare(a.date)
  ).map((entry) =>
    `<li><a href="${entry.date}/index.html"><span>${escapeHtml(entry.date)}</span><b>${
      escapeHtml(entry.level)
    }</b><em>${entry.score === null ? "不可评分" : `${entry.score} 分`}</em></a></li>`
  ).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${CSP}"><title>AI 协作日报历史</title><style>:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f7f8f6;color:#121613;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;letter-spacing:0}main{width:min(760px,calc(100% - 32px));margin:48px auto}h1{font:600 38px "Iowan Old Style","Palatino Linotype",serif;border-top:5px solid;padding-top:18px}ul{list-style:none;padding:0;border-bottom:1px solid}a{display:grid;grid-template-columns:1fr 60px 90px;gap:12px;padding:16px 0;border-top:1px solid #cfd5d0;color:inherit;text-decoration:none}b{color:#087e6b}em{text-align:right;font-style:normal;color:#626a64}@media(max-width:420px){a{grid-template-columns:1fr 50px}em{grid-column:1/-1;text-align:left}}</style></head><body><main><h1>AI 协作日报历史</h1><ul>${
    rows || "<li>暂无日报</li>"
  }</ul></main></body></html>`;
}

export function indexEntries(manifest: Manifest, current?: DailyReport): IndexEntry[] {
  const entries: IndexEntry[] = Object.values(manifest.reports).map((entry) => ({
    date: entry.date,
    level: "-",
    score: null,
  }));
  if (current) {
    const existing = entries.find((entry) => entry.date === current.window.date);
    const value = {
      date: current.window.date,
      level: current.maturity.level,
      score: current.score.total,
    };
    if (existing) Object.assign(existing, value);
    else entries.push(value);
  }
  return entries;
}
