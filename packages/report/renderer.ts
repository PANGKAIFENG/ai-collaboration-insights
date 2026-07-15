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

export function renderDailyReport(report: DailyReport): string {
  const timeZone = report.window.timeZone;
  const taskRows = report.tasks.length === 0
    ? `<p class="empty">该窗口没有足够信息形成任务候选。</p>`
    : report.tasks.map((task) => `
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
      task.verification === "verified" ? "已验证" : "未观察到验证"
    }</span><span>${task.sourceSessionIds.length} 个会话 · ${task.relationIds.length} 条关系</span></div>
          <div class="evidence-line">证据 ${
      escapeHtml(task.evidenceIds.join(" · ") || "不足")
    }</div>
        </div>
      </article>`).join("");

  const dimensionRows = report.score.dimensions.length === 0
    ? `<p class="empty">证据不足，五维评分暂不可用。</p>`
    : report.score.dimensions.map((dimension) => `
      <div class="dimension">
        <span>${escapeHtml(dimension.label)}</span>
        <div class="track"><i style="width:${dimension.score ?? 0}%"></i></div>
        <strong>${dimension.score === null ? "不可用" : dimension.score}</strong>
      </div>`).join("");

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
    .overview{display:grid;grid-template-columns:minmax(210px,.72fr) 1.28fr;gap:32px}.level{background:var(--ink);color:white;padding:24px;min-height:210px;display:flex;flex-direction:column;justify-content:space-between}.level small{color:#b9c4bc}.level strong{font:700 78px/.9 ui-monospace,SFMono-Regular,Menlo,monospace}.level p{margin:16px 0 0;font-size:13px;line-height:1.55;color:#d8ded9}.score{font:600 32px "Iowan Old Style","Palatino Linotype",serif;color:#71d8c0}
    .metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-top:1px solid var(--line);border-left:1px solid var(--line)}.metric{min-height:105px;padding:14px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);display:flex;flex-direction:column;justify-content:space-between;background:var(--panel)}.metric span,.metric small{font-size:11px;color:var(--muted)}.metric strong{font:600 25px ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}
    .dimensions{margin-top:24px}.dimension{display:grid;grid-template-columns:92px 1fr 54px;gap:12px;align-items:center;padding:8px 0;font-size:13px}.dimension strong{text-align:right;font:600 13px ui-monospace,SFMono-Regular,Menlo,monospace}.track{height:7px;background:var(--soft)}.track i{height:100%;display:block;background:var(--signal);max-width:100%}
    .task-row{display:grid;grid-template-columns:132px 1fr;gap:20px;padding:22px 0;border-top:1px solid var(--line)}.task-row:last-child{border-bottom:1px solid var(--line)}.task-time{font:12px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted)}.task-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.task-heading h3,.coach-row h3{font-size:16px;line-height:1.35;margin:0;overflow-wrap:anywhere}.confidence{white-space:nowrap;font:11px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--signal)}.task-main p{margin:8px 0 12px;color:#323934;line-height:1.65}.task-meta{display:flex;flex-wrap:wrap;gap:8px 18px;font-size:12px;color:var(--muted)}.evidence-line{margin-top:8px;font:10px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#7d857f;overflow-wrap:anywhere}
    .coach-row{display:grid;grid-template-columns:64px 1fr;gap:18px;padding:22px 0;border-top:1px solid var(--line)}.coach-number{font:600 28px "Iowan Old Style","Palatino Linotype",serif;color:var(--warn)}.coach-row p{margin:9px 0;color:#323934;line-height:1.55}.coach-row b{display:inline-block;min-width:82px;color:var(--ink)}.coach-row small{color:var(--muted)}.empty{padding:24px 0;color:var(--muted)}footer{padding-top:20px;color:var(--muted);font:11px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}
    @media(max-width:760px){main{width:min(100% - 28px,1180px);padding-top:14px}header{grid-template-columns:1fr}.header-meta{text-align:left}.overview{grid-template-columns:1fr}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.section-head{grid-template-columns:42px 1fr}.task-row{grid-template-columns:1fr;gap:8px}.task-heading{display:block}.confidence{display:inline-block;margin-top:6px}.coach-row{grid-template-columns:42px 1fr}.level{min-height:180px}.level strong{font-size:64px}}
    @media(max-width:380px){.metrics{grid-template-columns:1fr}.dimension{grid-template-columns:76px minmax(70px,1fr) 44px}.task-meta{display:grid}.status{max-width:100%;overflow-wrap:anywhere}}
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
