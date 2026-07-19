import { assert, assertEquals, assertRejects } from "../_assert.ts";
import { generateDailyReport, generateScheduledReports } from "../../packages/report/pipeline.ts";
import { grantConsent } from "../../packages/runtime/commands.ts";
import { PARSER_VERSION } from "../../packages/core/types.ts";

const sourceFixture = new URL("../fixtures/codex/window-basic.jsonl", import.meta.url).pathname;

Deno.test("publishes idempotent revisions and preserves current report on failure", async () => {
  const root = await Deno.makeTempDir();
  const sourceRoot = `${root}/source`;
  const dataDir = `${root}/data`;
  await Deno.mkdir(sourceRoot);
  await Deno.copyFile(sourceFixture, `${sourceRoot}/session.jsonl`);
  try {
    const options = {
      date: "2026-07-15",
      timeZone: "Asia/Shanghai",
      sourceRoot,
      dataDir,
      noAi: true,
      generationReason: "manual" as const,
      now: new Date("2026-07-15T11:01:00.000Z"),
    };
    const first = await generateDailyReport(options);
    assertEquals(first.status, "generated");
    assertEquals(first.report.revision, 1);
    assertEquals(first.report.provenance.parserVersion, PARSER_VERSION);
    assert(await exists(`${dataDir}/reports/2026-07-15/report.json`));
    assert(await exists(`${dataDir}/reports/2026-07-15/index.html`));
    assert(await exists(`${dataDir}/reports/index.html`));
    assertEquals(
      JSON.parse(await Deno.readTextFile(`${dataDir}/.aci-owned.json`)),
      { schemaVersion: "1", app: "ai-collaboration-insights" },
    );

    const second = await generateDailyReport(options);
    assertEquals(second.status, "up_to_date");
    assertEquals(second.report.revision, 1);

    await appendMessage(`${sourceRoot}/session.jsonl`, "late-1", "2026-07-14T11:20:00.000Z");
    const third = await generateDailyReport(options);
    assertEquals(third.status, "generated");
    assertEquals(third.report.revision, 2);
    const beforeFailure = await Deno.readTextFile(`${dataDir}/reports/2026-07-15/report.json`);

    await appendMessage(`${sourceRoot}/session.jsonl`, "late-2", "2026-07-14T11:21:00.000Z");
    await assertRejects(
      () =>
        generateDailyReport({
          ...options,
          beforePublish: () => Promise.reject(new Error("injected")),
        }),
      /injected/,
    );
    assertEquals(
      await Deno.readTextFile(`${dataDir}/reports/2026-07-15/report.json`),
      beforeFailure,
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("rebuilds a same-fingerprint legacy report before strict validation", async () => {
  const root = await Deno.makeTempDir();
  const sourceRoot = `${root}/source`;
  const dataDir = `${root}/data`;
  await Deno.mkdir(sourceRoot);
  await Deno.copyFile(sourceFixture, `${sourceRoot}/session.jsonl`);
  const options = {
    date: "2026-07-15",
    timeZone: "Asia/Shanghai",
    sourceRoot,
    dataDir,
    noAi: true,
    generationReason: "manual" as const,
    now: new Date("2026-07-15T11:01:00.000Z"),
  };
  try {
    const first = await generateDailyReport(options);
    const reportPath = `${dataDir}/reports/2026-07-15/report.json`;
    const legacy = JSON.parse(await Deno.readTextFile(reportPath)) as Record<string, unknown>;
    legacy.schemaVersion = "1";
    (legacy.provenance as Record<string, unknown>).parserVersion = "1";
    for (const task of legacy.tasks as Array<Record<string, unknown>>) delete task.sourceTurnIds;
    await Deno.writeTextFile(reportPath, `${JSON.stringify(legacy)}\n`);

    const rebuilt = await generateDailyReport(options);

    assertEquals(rebuilt.status, "generated");
    assertEquals(rebuilt.report.revision, first.report.revision + 1);
    assertEquals(rebuilt.report.provenance.parserVersion, PARSER_VERSION);
    assert(rebuilt.report.tasks.every((task) => task.sourceTurnIds.length > 0));
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("refuses to publish into an existing unowned data directory", async () => {
  const root = await Deno.makeTempDir();
  const sourceRoot = `${root}/source`;
  const dataDir = `${root}/data`;
  await Deno.mkdir(sourceRoot);
  await Deno.mkdir(dataDir);
  await Deno.writeTextFile(`${dataDir}/user-file.txt`, "keep");
  await Deno.copyFile(sourceFixture, `${sourceRoot}/session.jsonl`);
  try {
    await assertRejects(
      () =>
        generateDailyReport({
          date: "2026-07-15",
          timeZone: "Asia/Shanghai",
          sourceRoot,
          dataDir,
          noAi: true,
          generationReason: "manual",
        }),
      /owned/,
    );
    assertEquals(await Deno.readTextFile(`${dataDir}/user-file.txt`), "keep");
    assertEquals((await Array.fromAsync(Deno.readDir(dataDir))).length, 1);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("scheduled runs catch up missing windows and recheck the latest closed window", async () => {
  const root = await Deno.makeTempDir();
  const sourceRoot = `${root}/source`;
  const dataDir = `${root}/data`;
  await Deno.mkdir(sourceRoot);
  await Deno.copyFile(sourceFixture, `${sourceRoot}/session.jsonl`);
  try {
    const first = await generateScheduledReports({
      now: new Date("2026-07-15T11:05:00.000Z"),
      timeZone: "Asia/Shanghai",
      sourceRoot,
      dataDir,
      noAi: true,
      catchUpLimit: 3,
    });
    assertEquals(first.map((result) => result.report.window.date), [
      "2026-07-13",
      "2026-07-14",
      "2026-07-15",
    ]);
    assertEquals(first.map((result) => result.report.generationReason), [
      "catch_up",
      "catch_up",
      "scheduled",
    ]);

    const second = await generateScheduledReports({
      now: new Date("2026-07-15T11:06:00.000Z"),
      timeZone: "Asia/Shanghai",
      sourceRoot,
      dataDir,
      noAi: true,
      catchUpLimit: 3,
    });
    assertEquals(second.length, 1);
    assertEquals(second[0].status, "up_to_date");
    assertEquals(second[0].report.window.date, "2026-07-15");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("enriches a deterministic report only after consent", async () => {
  const root = await Deno.makeTempDir();
  const sourceRoot = `${root}/source`;
  const dataDir = `${root}/data`;
  await Deno.mkdir(sourceRoot);
  await Deno.copyFile(sourceFixture, `${sourceRoot}/session.jsonl`);
  try {
    await grantConsent(`${dataDir}/consent.json`, new Date("2026-07-15T11:00:00.000Z"));
    const result = await generateDailyReport({
      date: "2026-07-15",
      timeZone: "Asia/Shanghai",
      sourceRoot,
      dataDir,
      noAi: false,
      generationReason: "manual",
      now: new Date("2026-07-15T11:01:00.000Z"),
      analyzerRunner: () =>
        Promise.resolve({
          code: 0,
          output: JSON.stringify({
            tasks: [{
              id: "task-1",
              name: "Deliver daily window coverage",
              outcome: "Window parser and tests were added",
              verificationStatus: "failed",
              confidence: 0.9,
              evidenceIds: ["task-1-intent"],
              needsDetail: false,
              conflict: false,
            }],
            insights: [],
            suggestions: [{
              issue: "Verification result is not explicit",
              evidenceId: "task-1-intent",
              action: "Run the window test suite",
              verification: "Record an explicit pass result",
            }],
          }),
        }),
    });
    assertEquals(result.report.analysisStatus.mode, "ai_enriched");
    assertEquals(result.report.analysisStatus.status, "complete");
    assertEquals(result.report.analysisStatus.coverage?.analyzedTasks, 1);
    assertEquals(result.report.tasks[0].name, "Deliver daily window coverage");
    assertEquals(result.report.tasks[0].verification, "failed");
    assertEquals(result.report.coachSuggestions.length, 1);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("does not upgrade attempted verification to verified during AI enrichment", async () => {
  const root = await Deno.makeTempDir();
  const sourceRoot = `${root}/source`;
  const dataDir = `${root}/data`;
  await Deno.mkdir(sourceRoot);
  await Deno.writeTextFile(
    `${sourceRoot}/session.jsonl`,
    [
      JSON.stringify({
        timestamp: "2026-07-14T11:00:00.000Z",
        type: "session_meta",
        payload: { id: "attempted-session", cwd: "/synthetic/project" },
      }),
      JSON.stringify({
        timestamp: "2026-07-14T11:00:01.000Z",
        type: "response_item",
        payload: {
          type: "message",
          id: "intent",
          role: "user",
          content: [{ text: "实现并验证报告" }],
        },
      }),
      JSON.stringify({
        timestamp: "2026-07-14T11:00:02.000Z",
        type: "response_item",
        payload: {
          type: "function_call",
          call_id: "verification-call",
          name: "exec_command",
          arguments: '{"cmd":"deno task verify"}',
        },
      }),
      JSON.stringify({
        timestamp: "2026-07-14T11:00:03.000Z",
        type: "response_item",
        payload: {
          type: "function_call_output",
          call_id: "verification-call",
          output: "verification command ran",
        },
      }),
    ].join("\n") + "\n",
  );
  try {
    await grantConsent(`${dataDir}/consent.json`, new Date("2026-07-15T11:00:00.000Z"));
    const result = await generateDailyReport({
      date: "2026-07-15",
      timeZone: "Asia/Shanghai",
      sourceRoot,
      dataDir,
      noAi: false,
      generationReason: "manual",
      analyzerRunner: () =>
        Promise.resolve({
          code: 0,
          output: JSON.stringify({
            tasks: [{
              id: "task-1",
              name: "Implement report verification",
              outcome: "Verification was attempted",
              verificationStatus: "attempted",
              confidence: 0.9,
              evidenceIds: ["task-1-intent"],
              needsDetail: false,
              conflict: false,
            }],
            insights: [],
            suggestions: [],
          }),
        }),
    });

    assertEquals(result.report.tasks[0].hasVerification, true);
    assertEquals(result.report.tasks[0].verification, "attempted");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("marks per-task analysis status and rescoring context on partial AI coverage", async () => {
  const root = await Deno.makeTempDir();
  const sourceRoot = `${root}/source`;
  const dataDir = `${root}/data`;
  await Deno.mkdir(sourceRoot);
  await Deno.copyFile(sourceFixture, `${sourceRoot}/session.jsonl`);
  await appendUserMessage(
    `${sourceRoot}/session.jsonl`,
    "second-task",
    "2026-07-14T11:20:00.000Z",
    "另外一个任务：整理发布说明",
  );
  try {
    await grantConsent(`${dataDir}/consent.json`, new Date("2026-07-15T11:00:00.000Z"));
    const result = await generateDailyReport({
      date: "2026-07-15",
      timeZone: "Asia/Shanghai",
      sourceRoot,
      dataDir,
      noAi: false,
      generationReason: "manual",
      analyzerRunner: () =>
        Promise.resolve({
          code: 0,
          output: JSON.stringify({
            tasks: [{
              id: "task-1",
              name: "Deliver report window coverage",
              outcome: "A synthetic parser change was recorded",
              verificationStatus: "not_observed",
              confidence: 0.9,
              evidenceIds: ["task-1-intent"],
              needsDetail: false,
              conflict: false,
            }],
            insights: [],
            suggestions: [],
          }),
        }),
    });

    assertEquals(result.report.analysisStatus.status, "partial");
    assertEquals(result.report.analysisStatus.coverage?.analyzedTasks, 1);
    assertEquals(
      result.report.tasks.find((task) => task.id === "task-1")?.analysisStatus,
      "analyzed",
    );
    assertEquals(
      result.report.tasks.some((task) => task.analysisStatus === "not_analyzed"),
      true,
    );
    assert(result.report.maturity.reason.includes("1 /"));
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("publishes one independent evidence packet for every task across sessions", async () => {
  const root = await Deno.makeTempDir();
  const sourceRoot = `${root}/source`;
  const dataDir = `${root}/data`;
  await Deno.mkdir(sourceRoot);
  await Deno.copyFile(sourceFixture, `${sourceRoot}/session-a.jsonl`);
  await appendUserMessage(
    `${sourceRoot}/session-a.jsonl`,
    "second-task",
    "2026-07-14T11:20:00.000Z",
    "另外一个任务：生成发布说明",
  );
  await Deno.writeTextFile(
    `${sourceRoot}/session-b.jsonl`,
    [
      JSON.stringify({
        timestamp: "2026-07-14T11:02:00.000Z",
        type: "session_meta",
        payload: { id: "synthetic-session-b", cwd: "/synthetic/projects/beta" },
      }),
      JSON.stringify({
        timestamp: "2026-07-14T11:04:00.000Z",
        type: "response_item",
        payload: {
          type: "message",
          id: "independent-task",
          role: "user",
          content: [{ type: "input_text", text: "Review an independent parser" }],
        },
      }),
    ].join("\n") + "\n",
  );
  try {
    const result = await generateDailyReport({
      date: "2026-07-15",
      timeZone: "Asia/Shanghai",
      sourceRoot,
      dataDir,
      noAi: true,
      generationReason: "manual",
    });
    assert(result.report.tasks.length >= 3);
    assertEquals(result.report.evidencePackets.length, result.report.tasks.length);
    assertEquals(
      result.report.evidencePackets.map((packet) => packet.taskId).sort(),
      result.report.tasks.map((task) => task.id).sort(),
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

async function appendMessage(path: string, id: string, timestamp: string): Promise<void> {
  await Deno.writeTextFile(
    path,
    `${
      JSON.stringify({
        timestamp,
        type: "response_item",
        payload: {
          type: "message",
          id,
          role: "assistant",
          content: [{ type: "output_text", text: "Synthetic late result" }],
        },
      })
    }\n`,
    { append: true },
  );
}

async function appendUserMessage(
  path: string,
  id: string,
  timestamp: string,
  text: string,
): Promise<void> {
  await Deno.writeTextFile(
    path,
    `${
      JSON.stringify({
        timestamp,
        type: "response_item",
        payload: {
          type: "message",
          id,
          role: "user",
          content: [{ type: "input_text", text }],
        },
      })
    }\n`,
    { append: true },
  );
}
