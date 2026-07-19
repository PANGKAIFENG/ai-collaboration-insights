import { assert, assertEquals } from "../_assert.ts";
import { scanCodexWindow } from "../../packages/codex/adapter.ts";
import { reportDateWindow } from "../../packages/core/time.ts";

const fixtureRoot = new URL("../fixtures/codex", import.meta.url).pathname;

function uuidV7(timestamp: string): string {
  const hex = Date.parse(timestamp).toString(16).padStart(12, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8)}-7000-8000-000000000000`;
}

Deno.test("scans a left-closed right-open window with stable deduplication", async () => {
  const window = reportDateWindow("2026-07-15", "Asia/Shanghai");
  const first = await scanCodexWindow({ root: fixtureRoot, window });
  const second = await scanCodexWindow({ root: fixtureRoot, window });
  assertEquals(first.events.length, 6);
  assertEquals(
    first.events.map((event) => event.eventId),
    second.events.map((event) => event.eventId),
  );
  assertEquals(first.fingerprint, second.fingerprint);
  assertEquals(first.diagnostics.unknownEvents, 1);
  assert(first.events.every((event) => event.timestamp < window.end));
  assert(first.events.some((event) => event.timestamp === window.start));
});

Deno.test("leaves source bytes mtime and mode unchanged", async () => {
  const file = `${fixtureRoot}/window-basic.jsonl`;
  const beforeBytes = await Deno.readFile(file);
  const before = await Deno.stat(file);
  await scanCodexWindow({
    root: fixtureRoot,
    window: reportDateWindow("2026-07-15", "Asia/Shanghai"),
  });
  const afterBytes = await Deno.readFile(file);
  const after = await Deno.stat(file);
  assertEquals(Array.from(afterBytes), Array.from(beforeBytes));
  assertEquals(after.mtime?.toISOString(), before.mtime?.toISOString());
  assertEquals(after.mode, before.mode);
});

Deno.test("skips oversized lines and reports partial completeness", async () => {
  const root = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(`${root}/oversized.jsonl`, `${"x".repeat(256)}\n`);
    const result = await scanCodexWindow({
      root,
      window: reportDateWindow("2026-07-15", "Asia/Shanghai"),
      limits: { maxLineBytes: 128, maxEvents: 100, maxPreviewChars: 100 },
    });
    assertEquals(result.diagnostics.skippedLines, 1);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("streams and assembles a synthetic 100 turn session", async () => {
  const root = await Deno.makeTempDir();
  try {
    const lines = [
      JSON.stringify({
        timestamp: "2026-07-14T11:00:00.000Z",
        type: "session_meta",
        payload: { id: "synthetic-long-session", cwd: "/synthetic/projects/long" },
      }),
    ];
    for (let index = 0; index < 100; index++) {
      const second = String(index % 60).padStart(2, "0");
      const minute = String(Math.floor(index / 60)).padStart(2, "0");
      const timestamp = `2026-07-14T11:${minute}:${second}.000Z`;
      lines.push(JSON.stringify({
        timestamp,
        type: "turn_context",
        payload: { turn_id: `turn-${index}` },
      }));
      lines.push(JSON.stringify({
        timestamp,
        type: "response_item",
        payload: { type: "message", role: "user", content: [{ text: `目标 ${index}` }] },
      }));
    }
    await Deno.writeTextFile(`${root}/long.jsonl`, `${lines.join("\n")}\n`);
    const first = await scanCodexWindow({
      root,
      window: reportDateWindow("2026-07-15", "Asia/Shanghai"),
    });
    const second = await scanCodexWindow({
      root,
      window: reportDateWindow("2026-07-15", "Asia/Shanghai"),
    });
    assertEquals(first.sourceTurns.length, 100);
    assertEquals(
      first.sourceTurns.map((turn) => turn.id),
      second.sourceTurns.map((turn) => turn.id),
    );
    assertEquals(first.diagnostics.unmatchedToolCalls, 0);
    assertEquals(first.diagnostics.unmatchedToolResults, 0);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("retains and pairs a native tool call and mixed-failure result with the same call id", async () => {
  const root = await Deno.makeTempDir();
  try {
    const lines = [
      {
        timestamp: "2026-07-14T11:00:00.000Z",
        type: "session_meta",
        payload: { id: "synthetic-tool-pair", cwd: "/synthetic/tool-pair" },
      },
      {
        timestamp: "2026-07-14T11:00:01.000Z",
        type: "turn_context",
        payload: { turn_id: "turn-tool-pair" },
      },
      {
        timestamp: "2026-07-14T11:00:02.000Z",
        type: "response_item",
        payload: {
          type: "function_call",
          call_id: "native-call-id",
          name: "exec_command",
          arguments: '{"cmd":"deno task test"}',
        },
      },
      {
        timestamp: "2026-07-14T11:00:03.000Z",
        type: "response_item",
        payload: {
          type: "function_call_output",
          call_id: "native-call-id",
          output: "8 passed, 1 failed",
        },
      },
    ];
    await Deno.writeTextFile(
      `${root}/tool-pair.jsonl`,
      `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`,
    );

    const result = await scanCodexWindow({
      root,
      window: reportDateWindow("2026-07-15", "Asia/Shanghai"),
    });
    const toolEvents = result.events.filter((event) =>
      event.kind === "tool_call" || event.kind === "tool_result"
    );

    assertEquals(toolEvents.length, 2);
    assert(toolEvents[0].eventId !== toolEvents[1].eventId);
    assertEquals(result.diagnostics.duplicateEvents, 0);
    assertEquals(result.sourceTurns[0].toolPairs.length, 1);
    assertEquals(result.sourceTurns[0].toolPairs[0].status, "matched");
    assertEquals(
      toolEvents.find((event) => event.kind === "tool_result")?.toolResultStatus,
      "error",
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("deduplicates replayed messages by safe semantic identity", async () => {
  const root = await Deno.makeTempDir();
  try {
    const session = JSON.stringify({
      timestamp: "2026-07-14T11:00:00.000Z",
      type: "session_meta",
      payload: { id: "synthetic-replay", cwd: "/synthetic/project" },
    });
    const message = JSON.stringify({
      timestamp: "2026-07-14T11:01:00.000Z",
      type: "response_item",
      payload: { type: "message", role: "user", content: [{ text: "same prompt" }] },
    });
    const later = JSON.stringify({
      timestamp: "2026-07-14T11:02:00.000Z",
      type: "response_item",
      payload: { type: "message", role: "user", content: [{ text: "same prompt" }] },
    });
    await Deno.writeTextFile(
      `${root}/replay.jsonl`,
      `${session}\n${message}\n${message}\n${later}\n`,
    );
    const result = await scanCodexWindow({
      root,
      window: reportDateWindow("2026-07-15", "Asia/Shanghai"),
    });
    assertEquals(result.events.filter((event) => event.kind === "message").length, 2);
    assertEquals(result.diagnostics.duplicateEvents, 1);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("filters replay snapshots and deduplicates messages inside one source turn", async () => {
  const root = await Deno.makeTempDir();
  try {
    const start = "2026-07-15T00:00:00.000Z";
    const lines = [
      {
        timestamp: start,
        type: "session_meta",
        payload: {
          id: uuidV7(start),
          session_id: "historical-session",
          cwd: "/synthetic/current-project",
        },
      },
      {
        timestamp: start,
        type: "session_meta",
        payload: { id: "historical-session", cwd: "/synthetic/old-project" },
      },
      {
        timestamp: start,
        type: "event_msg",
        payload: { type: "task_started", id: uuidV7("2026-07-14T23:00:00.000Z") },
      },
      {
        timestamp: start,
        type: "turn_context",
        payload: { turn_id: uuidV7("2026-07-14T23:00:00.000Z") },
      },
      {
        timestamp: start,
        type: "response_item",
        payload: { type: "message", role: "user", content: [{ text: "历史目标" }] },
      },
      {
        timestamp: "2026-07-15T00:00:01.000Z",
        type: "event_msg",
        payload: { type: "task_started", id: uuidV7("2026-07-15T00:00:01.000Z") },
      },
      {
        timestamp: "2026-07-15T00:00:01.010Z",
        type: "turn_context",
        payload: { turn_id: uuidV7("2026-07-15T00:00:01.000Z") },
      },
      {
        timestamp: "2026-07-15T00:00:01.020Z",
        type: "response_item",
        payload: { type: "message", role: "user", content: [{ text: "当前目标" }] },
      },
      {
        timestamp: "2026-07-15T00:00:01.030Z",
        type: "response_item",
        payload: { type: "message", role: "user", content: [{ text: "当前目标" }] },
      },
    ];
    await Deno.writeTextFile(
      `${root}/replay-snapshot.jsonl`,
      `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`,
    );

    const result = await scanCodexWindow({
      root,
      window: reportDateWindow("2026-07-15", "Asia/Shanghai"),
    });

    assertEquals(result.events.filter((event) => event.kind === "message").length, 1);
    assertEquals(
      result.events.find((event) => event.kind === "message")?.contentPreview,
      "当前目标",
    );
    assertEquals(result.sourceTurns.length, 1);
    assertEquals(result.diagnostics.replayedEvents, 4);
    assertEquals(result.diagnostics.duplicateEvents, 1);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
