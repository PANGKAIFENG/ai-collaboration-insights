import { assert, assertEquals } from "../_assert.ts";
import { createParserState, parseCodexLine } from "../../packages/codex/parser.ts";

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

Deno.test("maps last token usage without treating cumulative totals as another event", async () => {
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
  assertEquals(result.event?.usageSemantics, "session_cumulative");
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
