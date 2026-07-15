import { assert, assertEquals } from "../_assert.ts";
import { type AnalyzerCommand, runCodexAnalysis } from "../../packages/analysis/codex_analyzer.ts";
import type { AnalysisPackage } from "../../packages/analysis/redaction.ts";
import { grantConsent, readConsent, revokeConsent } from "../../packages/runtime/commands.ts";

const inputPackage: AnalysisPackage = {
  schemaVersion: "1",
  window: { date: "2026-07-15", start: "s", end: "e", timeZone: "Asia/Shanghai" },
  metrics: {
    sessions: 1,
    messages: 2,
    toolCalls: 1,
    skillCalls: 0,
    subagentCalls: 0,
    activeMinutes: 5,
    totalTokens: 100,
  },
  tasks: [{
    id: "task-1",
    name: "Synthetic task",
    outcome: "Synthetic outcome",
    verification: "not_observed",
    evidenceIds: ["evidence-1"],
  }],
  messages: [{ role: "user", text: "Implement synthetic task" }],
};

Deno.test("never invokes Codex before explicit consent", async () => {
  let invoked = false;
  const result = await runCodexAnalysis({
    input: inputPackage,
    consent: { schemaVersion: "1", disclosureVersion: "1", granted: false },
    runner: () => {
      invoked = true;
      return Promise.resolve({ code: 0, output: "{}" });
    },
  });
  assertEquals(result.status, "not_consented");
  assertEquals(invoked, false);
});

Deno.test("uses isolated ephemeral argv and validates model output", async () => {
  let request: AnalyzerCommand | undefined;
  const result = await runCodexAnalysis({
    input: inputPackage,
    consent: {
      schemaVersion: "1",
      disclosureVersion: "1",
      granted: true,
      grantedAt: "2026-07-15T11:00:00.000Z",
      scope: "daily_standard",
    },
    runner: (value) => {
      request = value;
      return Promise.resolve({
        code: 0,
        output: JSON.stringify({
          tasks: [{
            id: "task-1",
            name: "Implement analyzer",
            outcome: "Analyzer added",
            verificationStatus: "not_observed",
            confidence: 0.8,
          }],
          suggestions: [{
            issue: "Missing verification",
            evidenceId: "evidence-1",
            action: "Run tests",
            verification: "Observe pass result",
          }],
        }),
      });
    },
  });
  assertEquals(result.status, "complete");
  assert(request);
  assertEquals(request.command, "codex");
  assert(request.args.includes("--ephemeral"));
  assert(request.args.includes("--ignore-user-config"));
  assert(request.args.includes("--ignore-rules"));
  assert(request.args.includes("read-only"));
  assert(request.args.at(-1) === "-");
  assert(request.cwd.startsWith(Deno.env.get("TMPDIR") ?? "/"));
  assert(!request.stdin.includes("must-not-send"));
});

Deno.test("degrades on invalid output and runner failure", async () => {
  const consent = {
    schemaVersion: "1" as const,
    disclosureVersion: "1" as const,
    granted: true,
    grantedAt: "2026-07-15T11:00:00.000Z",
    scope: "daily_standard" as const,
  };
  const invalid = await runCodexAnalysis({
    input: inputPackage,
    consent,
    runner: () => Promise.resolve({ code: 0, output: '{"tasks":[],"suggestions":[{},{},{},{}]}' }),
  });
  const failed = await runCodexAnalysis({
    input: inputPackage,
    consent,
    runner: () => Promise.reject(new Deno.errors.NotFound("codex")),
  });
  assertEquals(invalid.status, "degraded");
  assertEquals(failed.status, "degraded");
});

Deno.test("persists and revokes only versioned consent state", async () => {
  const root = await Deno.makeTempDir();
  const path = `${root}/consent.json`;
  try {
    await grantConsent(path, new Date("2026-07-15T11:00:00.000Z"));
    assertEquals((await readConsent(path)).granted, true);
    await revokeConsent(path);
    assertEquals((await readConsent(path)).granted, false);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
