import { EVENT_SCHEMA_VERSION, type UnifiedEvent, type Usage } from "../core/types.ts";
import { sha256 } from "../core/io.ts";

export interface ParserState {
  rawSessionId: string;
  sourceSessionId: string;
  projectRef?: string;
  projectLabel?: string;
}

export interface ParserLimits {
  maxPreviewChars: number;
}

export interface ParseLineResult {
  status: "event" | "ignored" | "unknown" | "skipped";
  timestamp?: string;
  event?: UnifiedEvent;
}

type JsonObject = Record<string, unknown>;

export function createParserState(): ParserState {
  return { rawSessionId: "unknown", sourceSessionId: "unknown" };
}

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function projectLabel(cwd: string): string {
  const parts = cwd.replace(/\/+$/, "").split("/");
  return parts.at(-1)?.slice(0, 80) || "unknown-project";
}

function contentText(payload: JsonObject): string | undefined {
  if (!Array.isArray(payload.content)) return string(payload.message);
  const parts: string[] = [];
  for (const item of payload.content) {
    const value = object(item);
    const text = string(value?.text);
    if (text) parts.push(text);
  }
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function usageFrom(
  payload: JsonObject,
): {
  usage: Usage;
  semantics: NonNullable<UnifiedEvent["usageSemantics"]>;
  cumulative?: Usage;
} | undefined {
  const info = object(payload.info);
  const total = object(info?.total_token_usage);
  const last = object(info?.last_token_usage);
  const raw = last ?? total;
  if (!raw) return undefined;
  const normalize = (value: JsonObject): Usage => ({
    inputTokens: number(value.input_tokens),
    cachedInputTokens: number(value.cached_input_tokens),
    outputTokens: number(value.output_tokens),
    reasoningTokens: number(value.reasoning_output_tokens),
    totalTokens: number(value.total_tokens),
  });
  return {
    usage: normalize(raw),
    semantics: last ? "call_increment" : "session_cumulative",
    cumulative: total ? normalize(total) : undefined,
  };
}

function validRole(value: unknown): UnifiedEvent["role"] {
  return value === "user" || value === "assistant" || value === "developer" ? value : undefined;
}

function classifyToolAction(
  payload: JsonObject,
  toolName: string,
): UnifiedEvent["actionCategory"] {
  if (/apply_patch|write(?:_file)?|create(?:_file)?|edit(?:_file)?/i.test(toolName)) {
    return "artifact_change";
  }
  if (/(^|[_.-])(test|check|lint|build|verify)([_.-]|$)/i.test(toolName)) {
    return "verification";
  }
  const raw = string(payload.arguments) ?? string(payload.input) ?? "";
  const bounded = raw.slice(0, 32_000);
  if (
    /\b(?:deno\s+(?:task\s+)?(?:test|check|lint|verify)|npm\s+(?:run\s+)?(?:test|check|lint|build|verify)|pnpm\s+(?:run\s+)?(?:test|check|lint|build|verify)|yarn\s+(?:run\s+)?(?:test|check|lint|build|verify)|bun\s+(?:run\s+)?(?:test|check|lint|build|verify)|cargo\s+(?:test|check|build)|go\s+test|pytest|ruff\s+check|npx\s+tsc|make\s+test)\b/i
      .test(bounded)
  ) return "verification";
  return undefined;
}

async function stableEventId(
  state: ParserState,
  payload: JsonObject,
  timestamp: string,
  kind: UnifiedEvent["kind"],
  lineNumber: number,
  contentDigest?: string,
): Promise<string> {
  const native = string(payload.id) ?? string(payload.call_id) ?? string(payload.event_id);
  const key = native
    ? `${state.sourceSessionId}:native:${native}`
    : `${state.sourceSessionId}:${timestamp}:${kind}:${lineNumber}:${contentDigest ?? ""}`;
  return await sha256(key);
}

export async function parseCodexLine(
  line: string,
  lineNumber: number,
  state: ParserState,
  limits: Partial<ParserLimits> = {},
): Promise<ParseLineResult> {
  const maxPreviewChars = limits.maxPreviewChars ?? 500;
  let root: JsonObject;
  try {
    const parsed = object(JSON.parse(line));
    if (!parsed) return { status: "skipped" };
    root = parsed;
  } catch {
    return { status: "skipped" };
  }

  const timestamp = string(root.timestamp);
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) return { status: "skipped" };
  const rootType = string(root.type);
  const payload = object(root.payload) ?? {};

  if (rootType === "session_meta") {
    state.rawSessionId = string(payload.id) ?? string(payload.session_id) ?? state.rawSessionId;
    state.sourceSessionId = await sha256(`codex-session:${state.rawSessionId}`);
    const cwd = string(payload.cwd);
    if (cwd) {
      state.projectRef = await sha256(`codex-project:${cwd}`);
      state.projectLabel = projectLabel(cwd);
    }
    const eventId = await stableEventId(state, payload, timestamp, "session", lineNumber);
    return {
      status: "event",
      timestamp,
      event: {
        schemaVersion: EVENT_SCHEMA_VERSION,
        eventId,
        sourceTool: "codex",
        sourceSessionId: state.sourceSessionId,
        timestamp,
        kind: "session",
        projectRef: state.projectRef,
        projectLabel: state.projectLabel,
        availability: "available",
      },
    };
  }

  let kind: UnifiedEvent["kind"] | undefined;
  let role: UnifiedEvent["role"];
  let toolName: string | undefined;
  let actionCategory: UnifiedEvent["actionCategory"];
  let usage: Usage | undefined;
  let usageSemantics: UnifiedEvent["usageSemantics"];
  let usageCumulative: Usage | undefined;
  let subagentDepth: number | undefined;
  let subagentRunId: string | undefined;
  let subagentStatus: UnifiedEvent["subagentStatus"];
  let previewSource: string | undefined;

  if (rootType === "response_item") {
    const payloadType = string(payload.type);
    if (payloadType === "message" || payloadType === "agent_message") {
      kind = "message";
      role = validRole(payload.role) ?? (payloadType === "agent_message" ? "assistant" : undefined);
      previewSource = contentText(payload);
    } else if (payloadType === "function_call" || payloadType === "custom_tool_call") {
      kind = "tool_call";
      toolName = string(payload.name) ?? "unknown-tool";
      actionCategory = classifyToolAction(payload, toolName);
    } else if (payloadType === "web_search_call" || payloadType === "tool_search_call") {
      kind = "tool_call";
      toolName = payloadType === "web_search_call" ? "web_search" : "tool_search";
    } else if (
      payloadType === "function_call_output" || payloadType === "custom_tool_call_output" ||
      payloadType === "tool_search_output"
    ) {
      kind = "tool_result";
    } else if (payloadType === "reasoning") {
      return { status: "ignored", timestamp };
    }
  } else if (rootType === "event_msg") {
    const payloadType = string(payload.type);
    if (payloadType === "token_count") {
      const snapshot = usageFrom(payload);
      if (!snapshot) return { status: "ignored", timestamp };
      usage = snapshot.usage;
      usageSemantics = snapshot.semantics;
      usageCumulative = snapshot.cumulative;
      kind = "usage";
    } else if (payloadType === "sub_agent_activity") {
      kind = "subagent";
      const lifecycle = string(payload.kind);
      toolName = lifecycle ?? "subagent";
      subagentStatus = lifecycle === "started" || lifecycle === "interacted" ||
          lifecycle === "interrupted" || lifecycle === "completed"
        ? lifecycle
        : "unknown";
      const rawRunId = string(payload.agent_thread_id);
      subagentRunId = rawRunId ? await sha256(`codex-session:${rawRunId}`) : undefined;
      subagentDepth = Math.max(
        1,
        string(payload.agent_path)?.split("/").filter(Boolean).length ?? 1,
      );
    } else if (payloadType === "agent_message") {
      kind = "message";
      role = "assistant";
      previewSource = string(payload.message);
    } else {
      return { status: "ignored", timestamp };
    }
  } else if (
    rootType === "turn_context" || rootType === "compacted" || rootType === "world_state" ||
    rootType === "inter_agent_communication_metadata"
  ) {
    return { status: "ignored", timestamp };
  } else {
    return { status: "unknown", timestamp };
  }

  if (!kind) return { status: "unknown", timestamp };
  const normalized = previewSource?.replace(/\s+/g, " ").trim();
  const contentDigest = normalized
    ? await sha256(normalized)
    : usageCumulative
    ? await sha256(JSON.stringify(usageCumulative))
    : undefined;
  const contentPreview = normalized?.slice(0, maxPreviewChars);
  const eventId = await stableEventId(
    state,
    payload,
    timestamp,
    kind,
    lineNumber,
    contentDigest,
  );
  return {
    status: "event",
    timestamp,
    event: {
      schemaVersion: EVENT_SCHEMA_VERSION,
      eventId,
      sourceTool: "codex",
      sourceSessionId: state.sourceSessionId,
      timestamp,
      kind,
      role,
      usage,
      usageSemantics,
      toolName,
      actionCategory,
      subagentDepth,
      subagentRunId,
      subagentStatus,
      projectRef: state.projectRef,
      projectLabel: state.projectLabel,
      contentDigest,
      contentPreview,
      availability: state.rawSessionId === "unknown" ? "partial" : "available",
    },
  };
}
