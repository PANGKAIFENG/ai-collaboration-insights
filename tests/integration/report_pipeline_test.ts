import { assert, assertEquals, assertRejects } from "../_assert.ts";
import { generateDailyReport } from "../../packages/report/pipeline.ts";
import { grantConsent } from "../../packages/runtime/commands.ts";

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
    assert(await exists(`${dataDir}/reports/2026-07-15/report.json`));
    assert(await exists(`${dataDir}/reports/2026-07-15/index.html`));
    assert(await exists(`${dataDir}/reports/index.html`));

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
              verificationStatus: "attempted",
              confidence: 0.9,
            }],
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
    assertEquals(result.report.tasks[0].name, "Deliver daily window coverage");
    assertEquals(result.report.coachSuggestions.length, 1);
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
