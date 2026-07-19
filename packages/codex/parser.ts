import {
  EVENT_SCHEMA_VERSION,
  PARSER_VERSION,
  type SourceTurnBoundary,
  type UnifiedEvent,
  type Usage,
} from "../core/types.ts";
import { sha256 } from "../core/io.ts";

export interface ParserState {
  rawSessionId: string;
  sourceSessionId: string;
  parentSourceSessionId?: string;
  sourceSessionRole?: NonNullable<UnifiedEvent["sourceSessionRole"]>;
  projectRef?: string;
  projectLabel?: string;
  sourceTurnId?: string;
  turnBoundary?: SourceTurnBoundary;
  nativeTurnHasUser: boolean;
  nativeUserContent?: string;
  toolCallEvents: Map<string, UnifiedEvent>;
  replayGate?: {
    cutoffMs: number;
    awaitingLiveTask: boolean;
    replaying: boolean;
  };
}

export interface ParserLimits {
  maxPreviewChars: number;
  sourcePath: string;
}

export interface ParseLineResult {
  status: "event" | "ignored" | "replayed" | "unknown" | "skipped";
  timestamp?: string;
  event?: UnifiedEvent;
}

type JsonObject = Record<string, unknown>;

export function createParserState(): ParserState {
  return {
    rawSessionId: "unknown",
    sourceSessionId: "unknown",
    nativeTurnHasUser: false,
    toolCallEvents: new Map(),
  };
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

async function sessionIdentity(raw: string): Promise<string> {
  return await sha256(`codex-session:${raw}`);
}

function uuidV7Timestamp(value: string | undefined): number | undefined {
  const match = value?.match(/(?:^|_)([0-9a-f]{8})-([0-9a-f]{4})-7[0-9a-f]{3}-/i);
  if (!match) return undefined;
  const timestamp = Number.parseInt(`${match[1]}${match[2]}`, 16);
  return Number.isFinite(timestamp) ? timestamp : undefined;
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

const INJECTED_USER_CONTEXT =
  /^\s*(?:#\s*(?:AGENTS\.md instructions|(?:Files|Applications) mentioned by the user\s*:|Response annotations\b|Selected text\b)|Automation\s*:|<(?:environment_context|heartbeat|skill|in-app-browser-context)\b)/i;
const USER_REQUEST_MARKER = /##\s*My request for Codex\s*:\s*/i;

function normalizeUserMessage(text: string | undefined): string | undefined {
  if (!text) return text;
  const marker = USER_REQUEST_MARKER.exec(text);
  if (marker) return text.slice(marker.index + marker[0].length);
  return INJECTED_USER_CONTEXT.test(text) ? text : text;
}

function isInjectedScaffolding(text: string | undefined): boolean {
  return Boolean(text && INJECTED_USER_CONTEXT.test(text) && !USER_REQUEST_MARKER.test(text));
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
  if (
    /apply_patch|write(?:_file)?|create(?:_file)?|edit(?:_file)?/i.test(toolName) ||
    /(^|[_.-])(?:create|update|delete|publish|send|write|edit|close|reopen|merge|upload)([_.-]|$)/i
      .test(toolName)
  ) {
    return "artifact_change";
  }
  if (/(^|[_.-])(test|check|lint|build|verify)([_.-]|$)/i.test(toolName)) {
    return "verification";
  }
  const input = payload.arguments ?? payload.input ?? object(payload.function)?.arguments;
  const raw = typeof input === "string" ? input : input === undefined ? "" : JSON.stringify(input);
  const bounded = raw.slice(0, 32_000);
  if (
    /\bgh\s+(?:issue|pr|release|repo)\s+(?:create|edit|close|reopen|delete|merge|review|upload)\b/i
      .test(bounded) ||
    /\b(?:dws|dingtalk)\b[\s\S]{0,300}\b(?:create|update|delete|publish|send|edit)\b/i.test(
      bounded,
    )
  ) return "artifact_change";
  if (
    /\b(?:deno\s+(?:(?:task\s+)?(?:test|check|lint|verify)|fmt\s+--check)|npm\s+(?:run\s+)?(?:test|check|lint|build|verify)|pnpm\s+(?:run\s+)?(?:test|check|lint|build|verify)|yarn\s+(?:run\s+)?(?:test|check|lint|build|verify)|bun\s+(?:run\s+)?(?:test|check|lint|build|verify)|cargo\s+(?:test|check|build)|go\s+test|pytest|ruff\s+check|npx\s+tsc|make\s+test|git\s+(?:diff\s+--check|fsck)|(?:ba|z|k)?sh\s+-n|shellcheck|gh\s+(?:pr\s+checks|release\s+(?:view|download|verify-asset-attestation))|curl\s+[^\n]{0,200}(?:--fail(?:-with-body)?|-f)\b|jq\s+[^\n]{0,200}\s-e\b)/i
      .test(bounded)
  ) return "verification";
  if (/(^|[_.-])(read|get|view|list|inspect|preview)([_.-]|$)/i.test(toolName)) {
    return "inspection";
  }
  if (/\b(?:cat|sed|jq|find)\b/i.test(bounded)) return "inspection";
  return undefined;
}

const GENERIC_TOOL_PROJECTS = new Set([
  "desktop",
  "documents",
  "downloads",
  "codex",
  ".codex",
  "workspace",
  "workspaces",
  "projects",
  "repo",
  "repos",
  "repositories",
  "tmp",
]);

function toolProjectLabel(payload: JsonObject, toolName: string): string | undefined {
  if (/(?:^|[_.-])(?:dws|dingtalk)(?:[_.-]|$)/i.test(toolName)) return "dingtalk";
  const input = payload.arguments ?? payload.input ?? object(payload.function)?.arguments;
  const raw = typeof input === "string" ? input : input === undefined ? "" : JSON.stringify(input);
  const repository = raw.match(
    /(?:github\.com[/:]|--repo\s+)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/i,
  )?.[2]?.replace(/\.git$/, "");
  if (repository) return repository;
  const apiRepository = raw.match(
    /(?:^|\/)repos\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/|$)/i,
  )?.[2]?.replace(/\.git$/, "");
  if (apiRepository) return apiRepository;
  if (
    /\b(?:dws|dingtalk)\b[\s\S]{0,300}\b(?:create|update|delete|publish|send|edit)\b/i.test(
      raw,
    )
  ) return "dingtalk";

  let structured = object(input);
  if (!structured && typeof input === "string") {
    try {
      structured = object(JSON.parse(input));
    } catch {
      // Non-JSON command arguments are handled by the repository pattern above.
    }
  }
  const cwd = string(structured?.workdir) ?? string(structured?.cwd);
  if (cwd?.startsWith("/")) {
    const label = cwd.split("/").filter(Boolean).at(-1)?.replace(/\.git$/, "");
    if (
      label && !GENERIC_TOOL_PROJECTS.has(label.toLowerCase()) &&
      !/^(?:feature|fix|docs|spike)-\d+(?:-|$)/i.test(label)
    ) return label;
  }

  const markers = new Set([".git", "apps", "docs", "packages", "scripts", "src", "test", "tests"]);
  const paths = raw.match(/\/(?:[^/\s"'<>:,;]+\/){2,}[^/\s"'<>),;]+/g) ?? [];
  for (const path of paths) {
    if (
      /(?:^|\/)skills\/|(?:^|\/)\.codex\/plugins\/|(?:^|\/)\.agents\/skills\/|(?:^|\/)contents\//i
        .test(path)
    ) continue;
    const parts = path.replace(/[),.;]+$/, "").split("/").filter(Boolean);
    const markerIndex = parts.findIndex((part) => markers.has(part.toLowerCase()));
    if (markerIndex <= 0) continue;
    const label = parts[markerIndex - 1];
    if (label && !GENERIC_TOOL_PROJECTS.has(label.toLowerCase())) return label;
  }
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
    ? `${state.sourceSessionId}:native:${native}:${kind}:${validRole(payload.role) ?? ""}`
    : `${state.sourceSessionId}:${timestamp}:${kind}:${lineNumber}:${contentDigest ?? ""}`;
  return await sha256(key);
}

async function sourceTurnId(state: ParserState, raw: string): Promise<string> {
  return await sha256(`${state.sourceSessionId}:turn:${raw}`);
}

async function setNativeTurn(state: ParserState, raw: string): Promise<void> {
  state.sourceTurnId = await sourceTurnId(state, raw);
  state.turnBoundary = "native";
  state.nativeTurnHasUser = false;
  state.nativeUserContent = undefined;
}

async function setFallbackTurn(
  state: ParserState,
  payload: JsonObject,
  timestamp: string,
  lineNumber: number,
): Promise<void> {
  const native = string(payload.id) ?? string(payload.event_id);
  const raw = native ?? `${timestamp}:${lineNumber}`;
  state.sourceTurnId = await sourceTurnId(state, `fallback:${raw}`);
  state.turnBoundary = "inferred";
}

async function ensurePartialTurn(
  state: ParserState,
  timestamp: string,
  lineNumber: number,
): Promise<void> {
  if (state.sourceTurnId) return;
  state.sourceTurnId = await sourceTurnId(state, `partial:${timestamp}:${lineNumber}`);
  state.turnBoundary = "partial";
}

async function toolCallId(state: ParserState, payload: JsonObject): Promise<string | undefined> {
  const native = string(payload.call_id);
  return native ? await sha256(`${state.sourceSessionId}:tool-call:${native}`) : undefined;
}

function toolOutput(payload: JsonObject): string | undefined {
  if (payload.output === undefined) return undefined;
  return typeof payload.output === "string" ? payload.output : JSON.stringify(payload.output);
}

function toolResultStatus(output: string | undefined): UnifiedEvent["toolResultStatus"] {
  if (!output) return "unknown";
  try {
    const structured = object(JSON.parse(output));
    if (structured) {
      const isError = structured.isError ?? structured.is_error;
      if (isError === true) return "error";
      const exitCode = structured.exit_code;
      if (typeof exitCode === "number" && Number.isFinite(exitCode)) {
        return exitCode === 0 ? "success" : "error";
      }
    }
  } catch {
    // Fall through to bounded text signals for non-JSON tool output.
  }
  if (
    /"(?:isError|is_error)"\s*:\s*true|"exit_code"\s*:\s*[1-9]\d*|Process exited with code [1-9]\d*/i
      .test(output)
  ) return "error";
  const withoutZeroFailures = output.replace(
    /\b0\s+(?:errors?|fail(?:ed|ures?))\b/gi,
    "",
  );
  if (/\b(?:errors?|failed|failures?)\b/i.test(withoutZeroFailures)) return "error";
  if (
    /(?:"?exit_code"?\s*[:=]\s*0)|Process exited with code 0\b|"state"\s*:\s*true|\b(?:success|passed|completed)\b/i
      .test(output)
  ) {
    return "success";
  }
  return "unknown";
}

export async function parseCodexLine(
  line: string,
  lineNumber: number,
  state: ParserState,
  limits: Partial<ParserLimits> = {},
): Promise<ParseLineResult> {
  const maxPreviewChars = limits.maxPreviewChars ?? 500;
  const sourceRef = limits.sourcePath
    ? { path: limits.sourcePath, line: lineNumber + 1 }
    : undefined;
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

  if (state.replayGate?.awaitingLiveTask) {
    const payloadType = string(payload.type);
    if (rootType === "event_msg" && payloadType === "task_started") {
      const nativeTaskId = string(payload.turn_id) ?? string(payload.id);
      const nativeTimestamp = uuidV7Timestamp(nativeTaskId);
      const isLiveTask = nativeTimestamp !== undefined
        ? nativeTimestamp >= state.replayGate.cutoffMs
        : Date.parse(timestamp) > state.replayGate.cutoffMs;
      if (isLiveTask) {
        state.replayGate.awaitingLiveTask = false;
        state.replayGate.replaying = false;
      } else {
        state.replayGate.replaying = true;
        return { status: "replayed", timestamp };
      }
    } else if (
      state.replayGate.replaying && rootType === "event_msg" &&
      payloadType === "thread_settings_applied"
    ) {
      return { status: "ignored", timestamp };
    } else if (
      state.replayGate.replaying &&
      (rootType === "world_state" || rootType === "inter_agent_communication_metadata")
    ) {
      return { status: "ignored", timestamp };
    } else if (!state.replayGate.replaying && rootType === "session_meta") {
      return { status: "replayed", timestamp };
    } else if (state.replayGate.replaying) {
      return { status: "replayed", timestamp };
    }
  }

  if (rootType === "session_meta") {
    const previousSessionId = state.rawSessionId;
    const rawSessionId = string(payload.id) ?? string(payload.session_id);
    state.rawSessionId = rawSessionId ?? state.rawSessionId;
    state.sourceSessionId = await sessionIdentity(state.rawSessionId);
    const rawParentSessionId = string(payload.parent_thread_id);
    state.parentSourceSessionId = rawParentSessionId
      ? await sessionIdentity(rawParentSessionId)
      : undefined;
    const source = object(payload.source);
    const threadSource = string(payload.thread_source);
    state.sourceSessionRole = threadSource === "subagent" || object(source?.subagent)
      ? "subagent"
      : threadSource === "user" || !state.parentSourceSessionId
      ? "root"
      : "unknown";
    if (previousSessionId === "unknown") {
      const sessionTimestamp = uuidV7Timestamp(rawSessionId);
      if (sessionTimestamp !== undefined) {
        state.replayGate = {
          cutoffMs: sessionTimestamp,
          awaitingLiveTask: true,
          replaying: false,
        };
      }
    } else if (previousSessionId !== state.rawSessionId) {
      state.sourceTurnId = undefined;
      state.turnBoundary = undefined;
      state.nativeTurnHasUser = false;
      state.nativeUserContent = undefined;
      state.toolCallEvents.clear();
    }
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
        parserVersion: PARSER_VERSION,
        eventId,
        sourceTool: "codex",
        sourceSessionId: state.sourceSessionId,
        parentSourceSessionId: state.parentSourceSessionId,
        sourceSessionRole: state.sourceSessionRole,
        timestamp,
        kind: "session",
        projectRef: state.projectRef,
        projectLabel: state.projectLabel,
        sourceRef,
        availability: "available",
      },
    };
  }

  if (rootType === "turn_context") {
    const nativeTurnId = string(payload.turn_id);
    if (!nativeTurnId) return { status: "unknown", timestamp };
    await setNativeTurn(state, nativeTurnId);
    const cwd = string(payload.cwd);
    if (cwd) {
      state.projectRef = await sha256(`codex-project:${cwd}`);
      state.projectLabel = projectLabel(cwd);
    }
    const eventId = await stableEventId(
      state,
      { id: `turn:${nativeTurnId}` },
      timestamp,
      "turn_context",
      lineNumber,
    );
    return {
      status: "event",
      timestamp,
      event: {
        schemaVersion: EVENT_SCHEMA_VERSION,
        parserVersion: PARSER_VERSION,
        eventId,
        sourceTool: "codex",
        sourceSessionId: state.sourceSessionId,
        parentSourceSessionId: state.parentSourceSessionId,
        sourceSessionRole: state.sourceSessionRole,
        sourceTurnId: state.sourceTurnId,
        turnBoundary: "native",
        timestamp,
        kind: "turn_context",
        projectRef: state.projectRef,
        projectLabel: state.projectLabel,
        sourceRef,
        availability: state.rawSessionId === "unknown" ? "partial" : "available",
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
  let resultSource: string | undefined;
  let currentToolCallId: string | undefined;
  let currentToolResultStatus: UnifiedEvent["toolResultStatus"];
  let currentProjectLabel: string | undefined;

  if (rootType === "response_item") {
    const payloadType = string(payload.type);
    if (payloadType === "message" || payloadType === "agent_message") {
      kind = "message";
      role = validRole(payload.role) ?? (payloadType === "agent_message" ? "assistant" : undefined);
      previewSource = contentText(payload);
      if (role === "user") {
        const pureScaffolding = isInjectedScaffolding(previewSource);
        previewSource = normalizeUserMessage(previewSource);
        if (!pureScaffolding) {
          const repeatedNativeUser = state.turnBoundary === "native" &&
            state.nativeTurnHasUser && state.nativeUserContent === previewSource;
          if (state.turnBoundary !== "native" || (state.nativeTurnHasUser && !repeatedNativeUser)) {
            await setFallbackTurn(state, payload, timestamp, lineNumber);
          }
          if (state.turnBoundary === "native") {
            state.nativeTurnHasUser = true;
            state.nativeUserContent = previewSource;
          }
        }
      } else await ensurePartialTurn(state, timestamp, lineNumber);
    } else if (payloadType === "function_call" || payloadType === "custom_tool_call") {
      kind = "tool_call";
      toolName = string(payload.name) ?? "unknown-tool";
      actionCategory = classifyToolAction(payload, toolName);
      currentProjectLabel = toolProjectLabel(payload, toolName);
      await ensurePartialTurn(state, timestamp, lineNumber);
      currentToolCallId = await toolCallId(state, payload);
    } else if (payloadType === "web_search_call" || payloadType === "tool_search_call") {
      kind = "tool_call";
      toolName = payloadType === "web_search_call" ? "web_search" : "tool_search";
      await ensurePartialTurn(state, timestamp, lineNumber);
      currentToolCallId = await toolCallId(state, payload);
    } else if (
      payloadType === "function_call_output" || payloadType === "custom_tool_call_output" ||
      payloadType === "tool_search_output"
    ) {
      kind = "tool_result";
      await ensurePartialTurn(state, timestamp, lineNumber);
      currentToolCallId = await toolCallId(state, payload);
      resultSource = toolOutput(payload);
      currentToolResultStatus = toolResultStatus(resultSource);
    } else if (payloadType === "reasoning") {
      return { status: "ignored", timestamp };
    }
  } else if (rootType === "event_msg") {
    const payloadType = string(payload.type);
    if (payloadType === "task_started") {
      const nativeTurnId = string(payload.turn_id) ?? string(payload.id);
      if (nativeTurnId) await setNativeTurn(state, nativeTurnId);
      return { status: "ignored", timestamp };
    } else if (payloadType === "task_complete") {
      state.sourceTurnId = undefined;
      state.turnBoundary = undefined;
      state.nativeTurnHasUser = false;
      state.nativeUserContent = undefined;
      return { status: "ignored", timestamp };
    } else if (payloadType === "token_count") {
      const snapshot = usageFrom(payload);
      if (!snapshot) return { status: "ignored", timestamp };
      usage = snapshot.usage;
      usageSemantics = snapshot.semantics;
      usageCumulative = snapshot.cumulative;
      kind = "usage";
      await ensurePartialTurn(state, timestamp, lineNumber);
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
      await ensurePartialTurn(state, timestamp, lineNumber);
    } else if (payloadType === "agent_message") {
      kind = "message";
      role = "assistant";
      previewSource = string(payload.message);
      await ensurePartialTurn(state, timestamp, lineNumber);
    } else {
      return { status: "ignored", timestamp };
    }
  } else if (
    rootType === "compacted" || rootType === "world_state" ||
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
    : resultSource !== undefined
    ? await sha256(resultSource)
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
  const event: UnifiedEvent = {
    schemaVersion: EVENT_SCHEMA_VERSION,
    parserVersion: PARSER_VERSION,
    eventId,
    sourceTool: "codex",
    sourceSessionId: state.sourceSessionId,
    parentSourceSessionId: state.parentSourceSessionId,
    sourceSessionRole: state.sourceSessionRole,
    sourceTurnId: state.sourceTurnId,
    turnBoundary: state.turnBoundary,
    timestamp,
    kind,
    role,
    usage,
    usageSemantics,
    toolName,
    toolCallId: currentToolCallId,
    toolResultStatus: currentToolResultStatus,
    actionCategory,
    subagentDepth,
    subagentRunId,
    subagentStatus,
    projectRef: state.projectRef,
    projectLabel: currentProjectLabel ?? state.projectLabel,
    contentDigest,
    contentPreview,
    sourceRef,
    availability: state.rawSessionId === "unknown" ? "partial" : "available",
  };
  if (kind === "tool_call" && currentToolCallId) {
    state.toolCallEvents.set(currentToolCallId, event);
  } else if (kind === "tool_result" && currentToolCallId) {
    const parent = state.toolCallEvents.get(currentToolCallId);
    if (parent) {
      event.parentEventId = parent.eventId;
      event.actionCategory = parent.actionCategory;
      event.toolName = parent.toolName;
      event.projectLabel = parent.projectLabel;
      parent.childEventIds = [...new Set([...(parent.childEventIds ?? []), event.eventId])];
    }
  }
  return {
    status: "event",
    timestamp,
    event,
  };
}
