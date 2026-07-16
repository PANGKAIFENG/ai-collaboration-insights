export const APP_VERSION = "0.2.1";
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
  usageSemantics?: "session_cumulative" | "call_increment" | "unknown_snapshot";
  toolName?: string;
  actionCategory?: "verification" | "artifact_change";
  subagentDepth?: number;
  subagentRunId?: string;
  subagentStatus?: "started" | "interacted" | "interrupted" | "completed" | "unknown";
  projectRef?: string;
  projectLabel?: string;
  contentDigest?: string;
  contentPreview?: string;
  availability: "available" | "partial" | "unavailable";
}

export interface DistributionSummary {
  sampleSize: number;
  mean: number;
  median: number;
  p90: number;
}

export interface UsageDistributions {
  messagesPerSession: DistributionSummary;
  toolCallsPerSession: DistributionSummary;
  tokensPerSession: DistributionSummary;
  activeMinutesPerSession: DistributionSummary;
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
  sourceCategories?: EvidenceSourceCategory[];
  availability?: "complete" | "partial" | "unknown";
}

export type EvidenceSourceCategory =
  | "user_message"
  | "semantic_round"
  | "tool_action"
  | "tool_result"
  | "assistant_result"
  | "subagent_lifecycle"
  | "artifact_change"
  | "keyword_match";

export interface WorkBlock {
  id: string;
  start: string;
  end: string;
  activeMinutes: number;
  projectRef?: string;
  projectLabel?: string;
  eventIds: string[];
}

export type SemanticRoundTrigger =
  | "intent"
  | "user_feedback"
  | "verification_feedback"
  | "approach_change"
  | "continuation";

export interface SemanticRound {
  id: string;
  taskId: string;
  sequence: number;
  start: string;
  end: string;
  trigger: SemanticRoundTrigger;
  status: "baseline" | "effective" | "ineffective" | "pending";
  eventIds: string[];
  intentEventIds: string[];
  attemptEventIds: string[];
  feedbackEventIds: string[];
  adjustmentEventIds: string[];
  resultEventIds: string[];
  lifecycleEventIds: string[];
  loopReason?: "repeated_action_or_feedback";
}

export type EvidenceCategory =
  | "intent"
  | "outcome"
  | "verification"
  | "asset"
  | "delegation"
  | "feedback"
  | "attempt";

export interface EvidencePacketAnchor {
  eventId: string;
  category: EvidenceCategory;
  timestamp: string;
  kind: EventKind;
  text?: string;
}

export interface TaskEvidencePacket {
  schemaVersion: "1";
  taskId: string;
  anchors: EvidencePacketAnchor[];
  rounds: SemanticRound[];
  coverage: {
    requiredCategories: EvidenceCategory[];
    presentCategories: EvidenceCategory[];
    missingCategories: EvidenceCategory[];
    categoryRatio: number;
    totalAnchors: number;
    includedAnchors: number;
    omittedAnchors: number;
    totalRounds: number;
    includedRounds: number;
    omittedRounds: number;
    omittedRoundEventRefs: number;
    truncated: boolean;
  };
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
  sourceSessionIds: string[];
  relationIds: string[];
  semanticRoundCount: number;
  effectiveRoundCount: number;
  keyRounds: SemanticRound[];
  hasIteration: boolean;
  hasVerification: boolean;
  hasReusableAsset: boolean;
  analysisStatus?: "deterministic" | "analyzed" | "not_analyzed" | "degraded";
}

export interface TaskRelation {
  id: string;
  fromTaskId: string;
  toTaskId: string;
  fromSessionId: string;
  toSessionId: string;
  type: "continuation" | "delegation" | "shared_deliverable" | "candidate";
  evidenceEventIds: string[];
  confidence: number;
  merged: boolean;
}

export interface ScoreDimension {
  key: "intent" | "iteration" | "verification" | "delegation" | "assetization";
  label: string;
  score: number | null;
  confidence: number;
  evidenceIds: string[];
  status?: "available" | "candidate" | "degraded" | "unavailable";
  reason?: string;
}

export interface CoachSuggestion {
  issue: string;
  evidenceId: string;
  action: string;
  verification: string;
}

export interface SessionInsight {
  sessionRef: string;
  direction: string;
  conclusion: string;
  evidenceIds: string[];
  confidence: number;
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
    subagentInterrupted: number;
    activeMinutes: number;
    tokens: Usage;
  };
  usageDistributions: UsageDistributions;
  workBlocks: WorkBlock[];
  tasks: TaskSummary[];
  taskRelations: TaskRelation[];
  evidencePackets: TaskEvidencePacket[];
  score: { total: number | null; dimensions: ScoreDimension[] };
  maturity: { level: "L1" | "L2" | "L3" | "L4" | "unavailable"; reason: string };
  evidence: Evidence[];
  sessionInsights: SessionInsight[];
  coachSuggestions: CoachSuggestion[];
  analysisStatus: {
    mode: "deterministic" | "ai_enriched";
    status: "complete" | "partial" | "not_consented" | "disabled" | "degraded";
    reason?: string;
    coverage?: {
      totalTasks: number;
      analyzedTasks: number;
      detailTasks: number;
    };
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
