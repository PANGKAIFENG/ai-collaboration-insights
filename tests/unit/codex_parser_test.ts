import { assert, assertEquals } from "../_assert.ts";
import { createParserState, parseCodexLine } from "../../packages/codex/parser.ts";

function uuidV7(timestamp: string): string {
  const hex = Date.parse(timestamp).toString(16).padStart(12, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8)}-7000-8000-000000000000`;
}

Deno.test("maps a Codex user message to a bounded unified event", async () => {
  const state = createParserState();
  await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-14T11:00:00.000Z",
      type: "session_meta",
      payload: { id: "synthetic-session", cwd: "/synthetic/projects/alpha" },
    }),
    0,
    state,
  );
  const result = await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-14T11:01:00.000Z",
      type: "response_item",
      payload: {
        type: "message",
        id: "message-1",
        role: "user",
        content: [{ type: "input_text", text: "A".repeat(80) }],
      },
    }),
    1,
    state,
    { maxPreviewChars: 32 },
  );
  assert(result.event);
  assertEquals(result.event.kind, "message");
  assertEquals(result.event.role, "user");
  assertEquals(result.event.projectLabel, "alpha");
  assertEquals(result.event.contentPreview?.length, 32);
  assert(result.event.contentDigest !== undefined);
  assert(!result.event.sourceSessionId.includes("synthetic-session"));
});

Deno.test("maps last token usage as a window-local call increment", async () => {
  const result = await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-14T11:02:00.000Z",
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          last_token_usage: {
            input_tokens: 12,
            cached_input_tokens: 2,
            output_tokens: 4,
            reasoning_output_tokens: 1,
            total_tokens: 16,
          },
          total_token_usage: { total_tokens: 999 },
        },
      },
    }),
    2,
    createParserState(),
  );
  assertEquals(result.event?.usage, {
    inputTokens: 12,
    cachedInputTokens: 2,
    outputTokens: 4,
    reasoningTokens: 1,
    totalTokens: 16,
  });
  assertEquals(result.event?.usageSemantics, "call_increment");
  assert(result.event?.contentDigest !== undefined);
});

Deno.test("extracts the real request after large injected user context before truncation", async () => {
  for (
    const injected of [
      "# Files mentioned by the user:",
      "# Applications mentioned by the user:",
      "Automation: Synthetic daily review",
    ]
  ) {
    const state = createParserState();
    const result = await parseCodexLine(
      JSON.stringify({
        timestamp: "2026-07-14T11:02:00.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{
            type: "input_text",
            text: `${injected}\n${
              "synthetic context ".repeat(80)
            }\n## My request for Codex:\n修复日报任务标题`,
          }],
        },
      }),
      1,
      state,
      { maxPreviewChars: 80 },
    );
    assertEquals(result.event?.contentPreview, "修复日报任务标题");
  }
});

Deno.test("extracts the real request when injected context and request are separate content items", async () => {
  const result = await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-14T11:02:00.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: "# Applications mentioned by the user: Synthetic App" },
          { type: "input_text", text: "## My request for Codex:\n修复日报任务标题" },
        ],
      },
    }),
    1,
    createParserState(),
  );
  assertEquals(result.event?.contentPreview, "修复日报任务标题");
});

Deno.test("extracts the request marker after ambient skill and annotation context", async () => {
  for (
    const prefix of [
      "<in-app-browser-context>synthetic</in-app-browser-context>",
      "<skill>synthetic instructions</skill>",
      "# Selected text\nsynthetic selection",
      "# Response annotations\nsynthetic annotation",
      "<heartbeat>synthetic</heartbeat>",
    ]
  ) {
    const result = await parseCodexLine(
      JSON.stringify({
        timestamp: "2026-07-14T11:02:00.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ text: `${prefix}\n## My request for Codex:\n推进阶段一` }],
        },
      }),
      1,
      createParserState(),
    );
    assertEquals(result.event?.contentPreview, "推进阶段一");
    assert(result.event?.sourceTurnId);
    assertEquals(result.event?.turnBoundary, "inferred");
  }
});

Deno.test("does not create inferred source turns for pure injected user scaffolding", async () => {
  for (
    const text of [
      "# AGENTS.md instructions\n<INSTRUCTIONS>synthetic</INSTRUCTIONS>",
      "<environment_context><current_date>2026-07-15</current_date></environment_context>",
      "<heartbeat>synthetic</heartbeat>",
      "# Files mentioned by the user: synthetic.md",
      "# Applications mentioned by the user: Synthetic App",
      "# Response annotations\nsynthetic annotation",
      "# Selected text\nsynthetic selection",
      "<skill>synthetic skill snapshot</skill>",
      "<in-app-browser-context>synthetic browser state</in-app-browser-context>",
    ]
  ) {
    const result = await parseCodexLine(
      JSON.stringify({
        timestamp: "2026-07-14T11:02:00.000Z",
        type: "response_item",
        payload: { type: "message", role: "user", content: [{ text }] },
      }),
      1,
      createParserState(),
    );
    assertEquals(result.event?.kind, "message");
    assertEquals(result.event?.sourceTurnId, undefined);
    assertEquals(result.event?.turnBoundary, undefined);
  }
});

Deno.test("maps supported search response items without unknown diagnostics", async () => {
  const state = createParserState();
  const call = await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-14T11:05:00.000Z",
      type: "response_item",
      payload: { type: "web_search_call", id: "search-1" },
    }),
    5,
    state,
  );
  const output = await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-14T11:05:01.000Z",
      type: "response_item",
      payload: { type: "tool_search_output", id: "search-output-1" },
    }),
    6,
    state,
  );
  assertEquals(call.event?.kind, "tool_call");
  assertEquals(call.event?.toolName, "web_search");
  assertEquals(output.event?.kind, "tool_result");
});

Deno.test("classifies verification commands without retaining command text", async () => {
  const result = await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-14T11:06:00.000Z",
      type: "response_item",
      payload: {
        type: "function_call",
        id: "verify-call",
        name: "exec_command",
        arguments: JSON.stringify({ cmd: "deno task verify" }),
      },
    }),
    7,
    createParserState(),
  );

  assertEquals(result.event?.kind, "tool_call");
  assertEquals(
    (result.event as unknown as { actionCategory?: string })?.actionCategory,
    "verification",
  );
  assertEquals(result.event?.contentPreview, undefined);
});

Deno.test("classifies verification commands from structured tool input", async () => {
  const result = await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-14T11:06:00.000Z",
      type: "response_item",
      payload: {
        type: "custom_tool_call",
        id: "verify-call",
        name: "exec",
        input: { cmd: "git diff --check" },
      },
    }),
    7,
    createParserState(),
  );

  assertEquals(result.event?.kind, "tool_call");
  assertEquals(result.event?.actionCategory, "verification");
  assertEquals(result.event?.contentPreview, undefined);
});

Deno.test("classifies release and read-back verification commands", async () => {
  for (
    const input of [
      'const result = await tools.exec_command({cmd: "gh release view v0.3.0"});',
      'const result = await tools.exec_command({cmd: "sh -n scripts/install.sh"});',
      'const result = await tools.exec_command({cmd: "curl --fail http://localhost/health"});',
    ]
  ) {
    const result = await parseCodexLine(
      JSON.stringify({
        timestamp: "2026-07-14T11:06:00.000Z",
        type: "response_item",
        payload: {
          type: "custom_tool_call",
          id: "verify-call",
          name: "exec",
          input,
        },
      }),
      7,
      createParserState(),
    );

    assertEquals(result.event?.actionCategory, "verification");
  }
});

Deno.test("classifies artifact mutation tools without retaining patch content", async () => {
  const result = await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-14T11:07:00.000Z",
      type: "response_item",
      payload: {
        type: "function_call",
        id: "patch-call",
        name: "functions.apply_patch",
        arguments: "private synthetic patch content",
      },
    }),
    8,
    createParserState(),
  );

  assertEquals(
    (result.event as unknown as { actionCategory?: string })?.actionCategory,
    "artifact_change",
  );
  assertEquals(result.event?.contentPreview, undefined);
});

Deno.test("classifies external state mutations as artifact changes", async () => {
  for (
    const [name, input] of [
      ["exec_command", { cmd: "gh issue edit 42 --repo example/project --add-label ready" }],
      ["exec", { cmd: "deno run /skills/dws/scripts/cli.ts document update synthetic" }],
      ["dws_update_document", { documentId: "synthetic-document", content: "private" }],
      ["github.release.create", { tag: "v0.3.0" }],
    ] as const
  ) {
    const result = await parseCodexLine(
      JSON.stringify({
        timestamp: "2026-07-14T11:07:00.000Z",
        type: "response_item",
        payload: {
          type: "function_call",
          id: `mutation-${name}`,
          name,
          arguments: JSON.stringify(input),
        },
      }),
      8,
      createParserState(),
    );

    assertEquals(result.event?.actionCategory, "artifact_change");
    assertEquals(result.event?.contentPreview, undefined);
  }
});

Deno.test("derives a task-local project from repository tool arguments", async () => {
  for (
    const [name, input, expected] of [
      [
        "exec_command",
        { cmd: "gh issue view 42 --repo example/ai-collaboration-insights" },
        "ai-collaboration-insights",
      ],
      [
        "exec_command",
        { cmd: "git status", workdir: "/workspace/style-work-backend" },
        "style-work-backend",
      ],
      [
        "read",
        { path: "/workspace/ai-collaboration-insights/docs/README.md" },
        "ai-collaboration-insights",
      ],
      ["mcp__dingtalk__update_document", { id: "synthetic-document" }, "dingtalk"],
      [
        "exec",
        { cmd: "deno run /skills/dws/scripts/cli.ts document update synthetic" },
        "dingtalk",
      ],
      [
        "read",
        { path: "/api/repos/example/information-retrieval/contents/docs/README.md" },
        "information-retrieval",
      ],
    ] as const
  ) {
    const state = createParserState();
    state.projectLabel = "Desktop";
    const result = await parseCodexLine(
      JSON.stringify({
        timestamp: "2026-07-14T11:07:00.000Z",
        type: "response_item",
        payload: {
          type: "function_call",
          id: "project-tool",
          name,
          arguments: JSON.stringify(input),
        },
      }),
      8,
      state,
    );

    assertEquals(result.event?.projectLabel, expected);
  }
});

Deno.test("does not derive projects from Skill or plugin cache paths", async () => {
  for (
    const path of [
      "/workspace/.codex/plugins/cache/tool/26.707.71524/scripts/run.ts",
      "/workspace/.config/skillshare/skills/dws/scripts/cli.ts",
    ]
  ) {
    const state = createParserState();
    state.projectLabel = "Desktop";
    const result = await parseCodexLine(
      JSON.stringify({
        timestamp: "2026-07-14T11:07:00.000Z",
        type: "response_item",
        payload: {
          type: "function_call",
          id: "cache-tool",
          name: "read",
          arguments: JSON.stringify({ path }),
        },
      }),
      8,
      state,
    );
    assertEquals(result.event?.projectLabel, "Desktop");
  }
});

Deno.test("classifies read-back tools as inspection candidates", async () => {
  for (
    const [name, input] of [
      ["read", { path: "/tmp/synthetic-output.txt" }],
      ["get_document", { id: "synthetic-document" }],
      ["exec_command", { cmd: "jq '.state' result.json" }],
      ["exec", { cmd: "find dist -maxdepth 1 -type f" }],
    ] as const
  ) {
    const result = await parseCodexLine(
      JSON.stringify({
        timestamp: "2026-07-14T11:08:00.000Z",
        type: "response_item",
        payload: {
          type: "function_call",
          id: `inspection-${name}`,
          name,
          arguments: JSON.stringify(input),
        },
      }),
      9,
      createParserState(),
    );

    assertEquals(result.event?.actionCategory, "inspection");
    assertEquals(result.event?.contentPreview, undefined);
  }
});

Deno.test("normalizes subagent lifecycle by stable thread identity", async () => {
  const result = await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-14T11:03:00.000Z",
      type: "event_msg",
      payload: {
        type: "sub_agent_activity",
        event_id: "activity-1",
        agent_thread_id: "synthetic-agent-thread",
        agent_path: "root/reviewer",
        kind: "started",
      },
    }),
    3,
    createParserState(),
  );
  assertEquals(result.event?.kind, "subagent");
  assertEquals(result.event?.subagentStatus, "started");
  assert(result.event?.subagentRunId);
  assert(!result.event.subagentRunId.includes("synthetic-agent-thread"));
});

Deno.test("retains a stable parent session identity from session metadata", async () => {
  const state = createParserState();
  const session = await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-14T11:00:00.000Z",
      type: "session_meta",
      payload: {
        id: "synthetic-child-session",
        parent_thread_id: "synthetic-parent-session",
        cwd: "/synthetic/project",
      },
    }),
    0,
    state,
  );
  const message = await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-14T11:01:00.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "评审实现" }],
      },
    }),
    1,
    state,
  );

  assert(session.event?.parentSourceSessionId);
  assertEquals(message.event?.parentSourceSessionId, session.event?.parentSourceSessionId);
  assert(message.event?.parentSourceSessionId !== message.event?.sourceSessionId);
  assert(!message.event?.parentSourceSessionId?.includes("synthetic-parent-session"));
});

Deno.test("propagates the native subagent session role to child events", async () => {
  const state = createParserState();
  const session = await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-14T11:00:00.000Z",
      type: "session_meta",
      payload: {
        id: "synthetic-child-session",
        parent_thread_id: "synthetic-parent-session",
        thread_source: "subagent",
        source: {
          subagent: {
            thread_spawn: {
              parent_thread_id: "synthetic-parent-session",
              depth: 1,
            },
          },
        },
        cwd: "/synthetic/project",
      },
    }),
    0,
    state,
  );
  const message = await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-14T11:01:00.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "执行委派检查" }],
      },
    }),
    1,
    state,
  );

  assertEquals(session.event?.sourceSessionRole, "subagent");
  assertEquals(message.event?.sourceSessionRole, "subagent");
});

Deno.test("explicitly ignores supported Codex multi-agent metadata", async () => {
  const result = await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-14T11:04:00.000Z",
      type: "inter_agent_communication_metadata",
      payload: { synthetic: true },
    }),
    4,
    createParserState(),
  );
  assertEquals(result.status, "ignored");
});

Deno.test("restores a native source turn and restricted provenance from turn_context", async () => {
  const state = createParserState();
  const context = await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-14T11:04:00.000Z",
      type: "turn_context",
      payload: { turn_id: "synthetic-native-turn", cwd: "/synthetic/private" },
    }),
    9,
    state,
    { sourcePath: "/synthetic/logs/session.jsonl" },
  );
  const message = await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-14T11:04:01.000Z",
      type: "response_item",
      payload: { type: "message", role: "user", content: [{ text: "实现 Source Turn" }] },
    }),
    10,
    state,
    { sourcePath: "/synthetic/logs/session.jsonl" },
  );
  assertEquals(context.event?.kind, "turn_context");
  assert(context.event?.sourceTurnId);
  assertEquals(context.event?.turnBoundary, "native");
  assertEquals(message.event?.sourceTurnId, context.event?.sourceTurnId);
  assertEquals(context.event?.projectLabel, "private");
  assertEquals(message.event?.projectLabel, "private");
  assertEquals(message.event?.parserVersion, "2");
  assertEquals(message.event?.sourceRef, {
    path: "/synthetic/logs/session.jsonl",
    line: 11,
  });
  assert(!JSON.stringify(context.event).includes("synthetic-native-turn"));
});

Deno.test("pairs tool call and result by native call id without retaining output", async () => {
  const state = createParserState();
  await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-14T11:05:00.000Z",
      type: "turn_context",
      payload: { turn_id: "turn-tool" },
    }),
    0,
    state,
  );
  const call = await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-14T11:05:01.000Z",
      type: "response_item",
      payload: {
        type: "function_call",
        call_id: "native-call-1",
        name: "exec_command",
        arguments: '{"cmd":"deno task test"}',
      },
    }),
    1,
    state,
  );
  const result = await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-14T11:05:02.000Z",
      type: "response_item",
      payload: {
        type: "function_call_output",
        call_id: "native-call-1",
        output: '{"exit_code":0,"output":"private synthetic output"}',
      },
    }),
    2,
    state,
  );
  assert(call.event?.toolCallId);
  assertEquals(result.event?.toolCallId, call.event?.toolCallId);
  assertEquals(result.event?.parentEventId, call.event?.eventId);
  assertEquals(call.event?.childEventIds, [result.event?.eventId]);
  assertEquals(result.event?.toolResultStatus, "success");
  assertEquals(result.event?.actionCategory, "verification");
  assert(result.event?.contentDigest);
  assertEquals(result.event?.contentPreview, undefined);
  assert(!JSON.stringify(result.event).includes("private synthetic output"));
  assert(!JSON.stringify(result.event).includes("native-call-1"));
});

Deno.test("parses process exit text as an authoritative tool result status", async () => {
  for (
    const [output, expected] of [
      ["Process exited with code 0", "success"],
      ["Process exited with code 2", "error"],
    ] as const
  ) {
    const state = createParserState();
    await parseCodexLine(
      JSON.stringify({
        timestamp: "2026-07-14T11:05:01.000Z",
        type: "response_item",
        payload: {
          type: "function_call",
          call_id: "native-call",
          name: "exec_command",
          arguments: '{"cmd":"deno task verify"}',
        },
      }),
      0,
      state,
    );
    const result = await parseCodexLine(
      JSON.stringify({
        timestamp: "2026-07-14T11:05:02.000Z",
        type: "response_item",
        payload: { type: "function_call_output", call_id: "native-call", output },
      }),
      1,
      state,
    );
    assertEquals(result.event?.toolResultStatus, expected);
    assertEquals(result.event?.actionCategory, "verification");
  }
});

Deno.test("does not treat a zero-failure summary as an error", async () => {
  const state = createParserState();
  await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-14T11:05:01.000Z",
      type: "response_item",
      payload: {
        type: "function_call",
        call_id: "native-call",
        name: "exec_command",
        arguments: '{"cmd":"deno task test"}',
      },
    }),
    0,
    state,
  );
  const result = await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-14T11:05:02.000Z",
      type: "response_item",
      payload: {
        type: "function_call_output",
        call_id: "native-call",
        output: "8 passed, 0 failed",
      },
    }),
    1,
    state,
  );

  assertEquals(result.event?.toolResultStatus, "success");
});

Deno.test("prioritizes structured successful exit status over nullable error fields", async () => {
  for (
    const output of [
      '{"exit_code":0,"error":null}',
      '{"isError":false,"exit_code":0,"output":"0 errors"}',
      "0 errors; exit_code: 0; completed",
    ]
  ) {
    const result = await parseCodexLine(
      JSON.stringify({
        timestamp: "2026-07-14T11:05:02.000Z",
        type: "response_item",
        payload: { type: "function_call_output", call_id: "native-call", output },
      }),
      1,
      createParserState(),
    );
    assertEquals(result.event?.toolResultStatus, "success");
  }
});

Deno.test("prioritizes a nonzero failure in mixed test result summaries", async () => {
  const state = createParserState();
  await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-14T11:05:01.000Z",
      type: "response_item",
      payload: {
        type: "function_call",
        call_id: "native-call",
        name: "exec_command",
        arguments: '{"cmd":"deno task test"}',
      },
    }),
    0,
    state,
  );
  const result = await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-14T11:05:02.000Z",
      type: "response_item",
      payload: {
        type: "function_call_output",
        call_id: "native-call",
        output: "8 passed, 1 failed",
      },
    }),
    1,
    state,
  );

  assertEquals(result.event?.toolResultStatus, "error");
});

Deno.test("creates a new inferred source turn for each legacy real user message", async () => {
  const state = createParserState();
  const first = await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-14T11:06:00.000Z",
      type: "response_item",
      payload: { type: "message", role: "user", content: [{ text: "第一个目标" }] },
    }),
    0,
    state,
  );
  const second = await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-14T11:07:00.000Z",
      type: "response_item",
      payload: { type: "message", role: "user", content: [{ text: "第二个目标" }] },
    }),
    1,
    state,
  );
  assert(first.event?.sourceTurnId);
  assert(second.event?.sourceTurnId);
  assert(first.event.sourceTurnId !== second.event.sourceTurnId);
  assertEquals(first.event.turnBoundary, "inferred");
  assertEquals(second.event.turnBoundary, "inferred");
});

Deno.test("starts an inferred turn when a second user message lacks a new native boundary", async () => {
  const state = createParserState();
  await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-14T11:04:00.000Z",
      type: "turn_context",
      payload: { turn_id: "native-turn-1" },
    }),
    0,
    state,
  );
  const first = await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-14T11:04:01.000Z",
      type: "response_item",
      payload: { type: "message", role: "user", content: [{ text: "第一个目标" }] },
    }),
    1,
    state,
  );
  const second = await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-14T11:04:02.000Z",
      type: "response_item",
      payload: { type: "message", role: "user", content: [{ text: "第二个目标" }] },
    }),
    2,
    state,
  );

  assertEquals(first.event?.turnBoundary, "native");
  assertEquals(second.event?.turnBoundary, "inferred");
  assert(first.event?.sourceTurnId !== second.event?.sourceTurnId);
});

Deno.test("filters historical replay before the live task boundary", async () => {
  const state = createParserState();
  const start = "2026-07-15T00:00:00.000Z";
  const wrapper = await parseCodexLine(
    JSON.stringify({
      timestamp: start,
      type: "session_meta",
      payload: {
        id: uuidV7(start),
        session_id: "historical-session",
        cwd: "/synthetic/project",
      },
    }),
    0,
    state,
  );
  const oldStarted = await parseCodexLine(
    JSON.stringify({
      timestamp: start,
      type: "event_msg",
      payload: { type: "task_started", id: uuidV7("2026-07-14T23:00:00.000Z") },
    }),
    1,
    state,
  );
  const oldMessage = await parseCodexLine(
    JSON.stringify({
      timestamp: start,
      type: "response_item",
      payload: { type: "message", role: "user", content: [{ text: "历史目标" }] },
    }),
    2,
    state,
  );
  const liveStarted = await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-15T00:00:01.000Z",
      type: "event_msg",
      payload: { type: "task_started", id: uuidV7("2026-07-15T00:00:01.000Z") },
    }),
    3,
    state,
  );
  const liveMessage = await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-15T00:00:02.000Z",
      type: "response_item",
      payload: { type: "message", role: "user", content: [{ text: "当前目标" }] },
    }),
    4,
    state,
  );

  assertEquals(wrapper.status, "event");
  assertEquals(oldStarted.status, "replayed");
  assertEquals(oldMessage.status, "replayed");
  assertEquals(liveStarted.status, "ignored");
  assertEquals(liveMessage.event?.role, "user");
  assertEquals(liveMessage.event?.turnBoundary, "native");
  assertEquals(liveMessage.event?.projectLabel, "project");
  assert(!JSON.stringify(liveMessage.event).includes("historical-session"));
});

Deno.test("exits replay mode at a live task boundary with a non-UUIDv7 native id", async () => {
  const state = createParserState();
  const start = "2026-07-15T00:00:00.000Z";
  await parseCodexLine(
    JSON.stringify({
      timestamp: start,
      type: "session_meta",
      payload: { id: uuidV7(start), cwd: "/synthetic/project" },
    }),
    0,
    state,
  );
  const historical = await parseCodexLine(
    JSON.stringify({
      timestamp: start,
      type: "event_msg",
      payload: { type: "task_started", id: uuidV7("2026-07-14T23:00:00.000Z") },
    }),
    1,
    state,
  );
  const liveStarted = await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-15T00:00:01.000Z",
      type: "event_msg",
      payload: { type: "task_started", id: "native-task-alpha" },
    }),
    2,
    state,
  );
  const liveMessage = await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-15T00:00:02.000Z",
      type: "response_item",
      payload: { type: "message", role: "user", content: [{ text: "当前目标" }] },
    }),
    3,
    state,
  );

  assertEquals(historical.status, "replayed");
  assertEquals(liveStarted.status, "ignored");
  assertEquals(liveMessage.event?.contentPreview, "当前目标");
  assertEquals(liveMessage.event?.turnBoundary, "native");
});

Deno.test("does not replay a normal UUIDv7 session that has no task_started event", async () => {
  const state = createParserState();
  const start = "2026-07-15T00:00:00.000Z";
  await parseCodexLine(
    JSON.stringify({
      timestamp: start,
      type: "session_meta",
      payload: { id: uuidV7(start), cwd: "/synthetic/project" },
    }),
    0,
    state,
  );
  const result = await parseCodexLine(
    JSON.stringify({
      timestamp: "2026-07-15T00:00:01.000Z",
      type: "response_item",
      payload: { type: "message", role: "user", content: [{ text: "真实目标" }] },
    }),
    1,
    state,
  );

  assertEquals(result.status, "event");
  assertEquals(result.event?.contentPreview, "真实目标");
  assertEquals(result.event?.turnBoundary, "inferred");
});

Deno.test("marks malformed and unsupported lines without guessing fields", async () => {
  const malformed = await parseCodexLine("{bad", 0, createParserState());
  const unknown = await parseCodexLine(
    '{"timestamp":"2026-07-14T11:00:00.000Z","type":"future_record","payload":{}}',
    1,
    createParserState(),
  );
  assertEquals(malformed.status, "skipped");
  assertEquals(unknown.status, "unknown");
  assertEquals(unknown.event, undefined);
});
