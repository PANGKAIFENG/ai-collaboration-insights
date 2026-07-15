export const APP_VERSION = "0.1.0";
export const EVENT_SCHEMA_VERSION = "1";
export const REPORT_SCHEMA_VERSION = "1";

export type EventKind =
  | "session"
  | "message"
  | "tool_call"
  | "tool_result"
  | "usage"
  | "subagent"
  | "unknown";

export interface Usage {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
}

export interface UnifiedEvent {
  schemaVersion: typeof EVENT_SCHEMA_VERSION;
  eventId: string;
  sourceTool: "codex";
  sourceSessionId: string;
  timestamp: string;
  kind: EventKind;
  role?: "user" | "assistant" | "developer";
  model?: string;
  usage?: Usage;
  toolName?: string;
  subagentDepth?: number;
  projectRef?: string;
  projectLabel?: string;
  contentDigest?: string;
  contentPreview?: string;
  availability: "available" | "partial" | "unavailable";
}

export interface ReportWindow {
  date: string;
  start: string;
  end: string;
  timeZone: string;
}

export interface Evidence {
  id: string;
  type: string;
  label: string;
  eventIds: string[];
  confidence: number;
}

export interface WorkBlock {
  id: string;
  start: string;
  end: string;
  activeMinutes: number;
  projectRef?: string;
  projectLabel?: string;
  eventIds: string[];
}

export interface TaskSummary {
  id: string;
  name: string;
  projectRef?: string;
  projectLabel?: string;
  start: string;
  end: string;
  activeMinutes: number;
  outcome: string;
  verification: "verified" | "attempted" | "not_observed";
  confidence: number;
  evidenceIds: string[];
  hasIteration: boolean;
  hasVerification: boolean;
  hasReusableAsset: boolean;
}

export interface ScoreDimension {
  key: "intent" | "iteration" | "verification" | "delegation" | "assetization";
  label: string;
  score: number | null;
  confidence: number;
  evidenceIds: string[];
}

export interface CoachSuggestion {
  issue: string;
  evidenceId: string;
  action: string;
  verification: string;
}

export interface DailyReport {
  schemaVersion: typeof REPORT_SCHEMA_VERSION;
  reportId: string;
  window: ReportWindow;
  revision: number;
  generationReason: "manual" | "scheduled" | "catch_up";
  generatedAt: string;
  completeness: {
    status: "complete" | "partial" | "no_data";
    parsedEvents: number;
    skippedLines: number;
    unknownEvents: number;
    notes: string[];
  };
  usageMetrics: {
    sessions: number;
    messages: number;
    toolCalls: number;
    skillCalls: number;
    subagentCalls: number;
    activeMinutes: number;
    tokens: Usage;
  };
  workBlocks: WorkBlock[];
  tasks: TaskSummary[];
  score: { total: number | null; dimensions: ScoreDimension[] };
  maturity: { level: "L1" | "L2" | "L3" | "L4" | "unavailable"; reason: string };
  evidence: Evidence[];
  coachSuggestions: CoachSuggestion[];
  analysisStatus: {
    mode: "deterministic" | "ai_enriched";
    status: "complete" | "not_consented" | "disabled" | "degraded";
    reason?: string;
  };
  provenance: {
    appVersion: string;
    parserVersion: string;
    analyzerVersion: string;
    rubricVersion: string;
    rendererVersion: string;
    sourceFingerprint: string;
  };
}

export interface ManifestEntry {
  date: string;
  revision: number;
  sourceFingerprint: string;
  reportDigest: string;
  generatedAt: string;
}

export interface Manifest {
  schemaVersion: "1";
  reports: Record<string, ManifestEntry>;
}
