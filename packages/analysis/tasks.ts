import type { ReportWindow, TaskRelation, UnifiedEvent } from "../core/types.ts";
import { unionActiveMinutes } from "./facts.ts";
import { backfillLegacySourceTurns, isScaffoldingEvent } from "./turns.ts";

const NEARBY_MS = 20 * 60 * 1000;
const NAMED_OBJECT_GAP_MS = 60 * 60 * 1000;
const TRANSITION =
  /^(?:另外(?:一个)?任务|另一个任务|新任务|接下来(?:请)?|现在(?:请)?(?:实现|开发|创建|排查))\s*[：:，,]?\s*/i;
const CONTINUATION = /^(?:继续|接着|补充|修复|调整|验证|重试|再)/i;
const SHORT_FOLLOW_UP = /^(?:确认|可以|好的|是的|同意|没问题|按(?:这个|上面|此)|那就)/i;
const REFERENTIAL_FOLLOW_UP = /^(?:这个|这张|这里|上面|刚才|你(?:上面|刚才)|图\s*\d+)/i;
const FEEDBACK_FOLLOW_UP = /^(?:我发现|我意思|不需要|去掉|没看到|只看到|把上面|已登录)/i;
const IMPLEMENTATION_START = /^(?:那|就)\s*(?:集成|安装|接入)/i;
const WORK_OBJECT =
  /(?:插件|日报|周报|月报|看板|面板|报告|文档|原型|页面|仓库|分支|表格|视频|图片|PRD|技术债|开源|公开化)/giu;
const LATIN_OBJECT = /\b[A-Za-z][A-Za-z0-9_.-]{2,}\b/g;
const LATIN_OBJECT_ALLOWLIST = new Set([
  "dashboard",
  "github",
  "obsidian",
  "plugin",
  "readme",
  "report",
  "skill",
  "tasknotes",
]);
const GENERIC_PROJECT_LABELS = new Set([
  "desktop",
  "documents",
  "downloads",
  "codex",
  ".codex",
  "home",
  "workspace",
  "workspaces",
  "projects",
  "project",
  "repo",
  "repos",
  "repositories",
  "source",
  "src",
  "tmp",
  "private",
  "unknown-project",
]);

export interface TaskBoundary {
  id: string;
  name: string;
  projectRef?: string;
  projectLabel?: string;
  sourceSessionIds: string[];
  sourceTurnIds: string[];
  eventIds: string[];
  events: UnifiedEvent[];
  start: string;
  end: string;
  activeMinutes: number;
  confidence: number;
  relationIds: string[];
}

export interface TaskBoundaryResult {
  tasks: TaskBoundary[];
  relations: TaskRelation[];
}

interface Candidate {
  id: string;
  projectRef?: string;
  projectLabel?: string;
  sourceSessionId: string;
  sourceTurnIds: string[];
  events: UnifiedEvent[];
  anchors: Set<string>;
}

function isUserGoal(event: UnifiedEvent): boolean {
  return event.kind === "message" && event.role === "user" &&
    (event.sourceSessionRole === "root" ||
      (!event.parentSourceSessionId && event.sourceSessionRole !== "subagent")) &&
    !isScaffoldingEvent(event);
}

function isActivity(event: UnifiedEvent): boolean {
  return event.kind === "message" || event.kind === "tool_call" || event.kind === "tool_result" ||
    event.kind === "subagent";
}

function cleanTitle(value: string | undefined, timestamp: string): string {
  const cleaned = value?.replace(TRANSITION, "").replace(/\s+/g, " ").trim();
  return (cleaned || `Codex task ${timestamp.slice(11, 16)}`).slice(0, 120);
}

function extractAnchors(events: UnifiedEvent[]): Set<string> {
  const anchors = new Set<string>();
  for (const event of events.filter(isUserGoal)) {
    const text = event.contentPreview ?? "";
    for (const match of text.matchAll(/(?:^|\s)#(\d+)\b/g)) {
      anchors.add(`reference:${match[1]}`);
    }
    for (
      const match of text.matchAll(
        /github\.com\/([^\s/]+)\/([^\s/]+)\/(issues|pull)\/(\d+)/gi,
      )
    ) {
      anchors.add(
        `github:${match[1].toLowerCase()}/${match[2].toLowerCase()}:${match[3].toLowerCase()}:${
          match[4]
        }`,
      );
      anchors.add(`reference:${match[4]}`);
    }
    for (
      const match of text.matchAll(/\b([A-Za-z0-9_.-]+\.(?:md|ts|tsx|js|json|py|html|css))\b/g)
    ) {
      anchors.add(`artifact:${match[1].toLowerCase()}`);
    }
  }
  return anchors;
}

function isGenericProjectLabel(value: string | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return GENERIC_PROJECT_LABELS.has(normalized) ||
    /^(?:feature|fix|docs|spike)-\d+(?:-|$)/.test(normalized);
}

function repositoryFromText(text: string): string | undefined {
  const match = text.match(
    /(?:github\.com[/:]|--repo\s+)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/i,
  );
  return match?.[2]?.replace(/\.git$/, "");
}

function repositoryFromPath(text: string): string | undefined {
  const paths = text.match(/\/(?:[^/\s"'<>:,;]+\/){2,}[^/\s"'<>),;]+/g) ?? [];
  const markers = new Set([
    ".git",
    "apps",
    "docs",
    "packages",
    "scripts",
    "skills",
    "src",
    "test",
    "tests",
  ]);
  for (const path of paths) {
    if (/(?:^|\/)skills\/[^/]+\/SKILL\.md$/i.test(path)) continue;
    const parts = path.replace(/[),.;]+$/, "").split("/").filter(Boolean);
    const markerIndex = parts.findIndex((part) => markers.has(part.toLowerCase()));
    if (markerIndex > 0) {
      const root = parts[markerIndex - 1];
      if (root && !GENERIC_PROJECT_LABELS.has(root.toLowerCase())) return root;
    }
  }
  return undefined;
}

function inferredProjectLabel(events: UnifiedEvent[], fallback?: string): string | undefined {
  for (const event of events.filter(isUserGoal)) {
    const text = event.contentPreview ?? "";
    const repository = repositoryFromText(text) ?? repositoryFromPath(text);
    if (repository) return repository;
  }
  const labels = new Map<string, { score: number; first: number }>();
  events.forEach((event, index) => {
    const label = event.projectLabel?.trim();
    if (!label) return;
    const score = isGenericProjectLabel(label) ? 1 : event.role === "user" ? 4 : 3;
    const current = labels.get(label);
    labels.set(label, {
      score: (current?.score ?? 0) + score,
      first: current?.first ?? index,
    });
  });
  const entries = [...labels.entries()];
  const candidates = entries.some(([label]) => !isGenericProjectLabel(label))
    ? entries.filter(([label]) => !isGenericProjectLabel(label))
    : entries;
  const best = candidates.toSorted((left, right) =>
    right[1].score - left[1].score || left[1].first - right[1].first ||
    left[0].localeCompare(right[0])
  )[0]?.[0];
  return best ?? fallback;
}

function clearTransition(previous: UnifiedEvent | undefined, current: UnifiedEvent): boolean {
  const currentText = current.contentPreview?.trim() ?? "";
  if (TRANSITION.test(currentText)) return true;
  if (CONTINUATION.test(currentText)) return false;
  const previousAnchors = new Set(
    [...(previous ? extractAnchors([previous]) : [])].filter((anchor) =>
      anchor.startsWith("github:") || anchor.startsWith("reference:")
    ),
  );
  const currentAnchors = new Set(
    [...extractAnchors([current])].filter((anchor) =>
      anchor.startsWith("github:") || anchor.startsWith("reference:")
    ),
  );
  return previousAnchors.size > 0 && currentAnchors.size > 0 &&
    ![...currentAnchors].some((anchor) => previousAnchors.has(anchor));
}

function goalObjectAnchors(event: UnifiedEvent): Set<string> {
  const text = event.contentPreview ?? "";
  const anchors = new Set<string>();
  for (const match of text.matchAll(WORK_OBJECT)) {
    const value = match[0];
    anchors.add(
      value === "看板" ? "dashboard" : /^(?:日报|周报|月报|报告)$/.test(value) ? "report" : value,
    );
  }
  for (const match of text.matchAll(LATIN_OBJECT)) {
    const value = match[0].toLowerCase();
    if (!LATIN_OBJECT_ALLOWLIST.has(value)) continue;
    anchors.add(value === "plugin" ? "插件" : value === "report" ? "report" : value);
  }
  return anchors;
}

function changesWorkObject(previous: UnifiedEvent, current: UnifiedEvent): boolean {
  const previousObjects = goalObjectAnchors(previous);
  const currentObjects = goalObjectAnchors(current);
  return previousObjects.size > 0 && currentObjects.size > 0 &&
    overlap(previousObjects, currentObjects).length === 0;
}

function isGenericFollowUp(event: UnifiedEvent): boolean {
  const text = event.contentPreview?.trim() ?? "";
  return goalObjectAnchors(event).size === 0 &&
    (SHORT_FOLLOW_UP.test(text) || REFERENTIAL_FOLLOW_UP.test(text) ||
      FEEDBACK_FOLLOW_UP.test(text));
}

function nativeTurnStartsNewTask(
  previous: UnifiedEvent | undefined,
  current: UnifiedEvent,
): boolean {
  if (!previous) return false;
  const currentText = current.contentPreview?.trim() ?? "";
  if (
    CONTINUATION.test(currentText) || SHORT_FOLLOW_UP.test(currentText) ||
    REFERENTIAL_FOLLOW_UP.test(currentText) || FEEDBACK_FOLLOW_UP.test(currentText)
  ) return false;
  if (IMPLEMENTATION_START.test(currentText)) return true;
  if (previous.projectRef && current.projectRef && previous.projectRef !== current.projectRef) {
    return true;
  }
  const elapsed = Date.parse(current.timestamp) - Date.parse(previous.timestamp);
  if (
    Number.isFinite(elapsed) && elapsed >= NAMED_OBJECT_GAP_MS &&
    goalObjectAnchors(current).size > 0
  ) return true;
  if (changesWorkObject(previous, current)) return true;
  return clearTransition(previous, current);
}

function legacySessionCandidates(sessionId: string, events: UnifiedEvent[]): Candidate[] {
  const ordered = events.filter(isActivity).toSorted((left, right) =>
    left.timestamp.localeCompare(right.timestamp) || left.eventId.localeCompare(right.eventId)
  );
  const candidates: Candidate[] = [];
  let current: UnifiedEvent[] | undefined;
  let previousGoal: UnifiedEvent | undefined;
  for (const event of ordered) {
    if (isScaffoldingEvent(event)) continue;
    if (isUserGoal(event)) {
      if (!current || clearTransition(previousGoal, event)) {
        current = [];
        candidates.push({
          id: `candidate-${sessionId}-${candidates.length + 1}`,
          projectRef: event.projectRef,
          projectLabel: event.projectLabel,
          sourceSessionId: sessionId,
          sourceTurnIds: event.sourceTurnId ? [event.sourceTurnId] : [],
          events: current,
          anchors: new Set(),
        });
      }
      previousGoal = event;
    }
    if (current) current.push(event);
  }
  if (candidates.length === 0) {
    const orphanEvents = ordered.filter((event) => !isScaffoldingEvent(event));
    if (orphanEvents.length > 0) {
      candidates.push({
        id: `candidate-${sessionId}-1`,
        projectRef: orphanEvents[0].projectRef,
        projectLabel: orphanEvents[0].projectLabel,
        sourceSessionId: sessionId,
        sourceTurnIds: [
          ...new Set(
            orphanEvents.flatMap((event) => event.sourceTurnId ? [event.sourceTurnId] : []),
          ),
        ],
        events: orphanEvents,
        anchors: new Set(),
      });
    }
  }
  for (const candidate of candidates) {
    const firstGoal = candidate.events.find(isUserGoal);
    candidate.sourceTurnIds = [
      ...new Set([
        ...candidate.sourceTurnIds,
        ...candidate.events.flatMap((event) => event.sourceTurnId ? [event.sourceTurnId] : []),
        ...(candidate.sourceTurnIds.length === 0 && firstGoal
          ? [`inferred:${sessionId}:${firstGoal.eventId}`]
          : []),
      ]),
    ];
    candidate.anchors = extractAnchors(candidate.events);
  }
  return candidates;
}

function turnFirstSessionCandidates(sessionId: string, events: UnifiedEvent[]): Candidate[] {
  const activity = events.filter(isActivity).filter((event) => !isScaffoldingEvent(event)).toSorted(
    (left, right) =>
      left.timestamp.localeCompare(right.timestamp) || left.eventId.localeCompare(right.eventId),
  );
  const grouped = new Map<string, UnifiedEvent[]>();
  for (const event of activity) {
    if (!event.sourceTurnId) continue;
    const values = grouped.get(event.sourceTurnId) ?? [];
    values.push(event);
    grouped.set(event.sourceTurnId, values);
  }
  const turns = [...grouped.entries()].toSorted((left, right) =>
    left[1][0].timestamp.localeCompare(right[1][0].timestamp) || left[0].localeCompare(right[0])
  );
  const candidates: Candidate[] = [];
  let current: Candidate | undefined;
  let previousGoal: UnifiedEvent | undefined;
  for (const [, turnEvents] of turns) {
    const goal = turnEvents.find(isUserGoal);
    if (!goal) {
      if (current) current.events.push(...turnEvents);
      continue;
    }
    // A native Source Turn is a traceable fact unit, not a new Task boundary.
    // Split only when the user gives explicit transition evidence or changes a
    // strong issue/artifact anchor.
    if (!current || nativeTurnStartsNewTask(previousGoal, goal)) {
      current = {
        id: `candidate-${sessionId}-${candidates.length + 1}`,
        projectRef: goal.projectRef,
        projectLabel: goal.projectLabel,
        sourceSessionId: sessionId,
        sourceTurnIds: [],
        events: [],
        anchors: new Set(),
      };
      candidates.push(current);
    }
    current.events.push(...turnEvents);
    if (!isGenericFollowUp(goal)) previousGoal = goal;
  }
  if (candidates.length === 0 && activity.length > 0) {
    candidates.push({
      id: `candidate-${sessionId}-1`,
      projectRef: activity[0].projectRef,
      projectLabel: activity[0].projectLabel,
      sourceSessionId: sessionId,
      sourceTurnIds: [
        ...new Set(activity.flatMap((event) => event.sourceTurnId ? [event.sourceTurnId] : [])),
      ],
      events: activity,
      anchors: new Set(),
    });
  }
  for (const candidate of candidates) {
    candidate.sourceTurnIds = [
      ...new Set(
        candidate.events.flatMap((event) => event.sourceTurnId ? [event.sourceTurnId] : []),
      ),
    ];
    candidate.anchors = extractAnchors(candidate.events);
  }
  return candidates;
}

function delegatedTurnCandidates(sessionId: string, events: UnifiedEvent[]): Candidate[] {
  const activity = events.filter(isActivity).filter((event) => !isScaffoldingEvent(event)).toSorted(
    (left, right) =>
      left.timestamp.localeCompare(right.timestamp) || left.eventId.localeCompare(right.eventId),
  );
  const grouped = new Map<string, UnifiedEvent[]>();
  const unassigned: UnifiedEvent[] = [];
  for (const event of activity) {
    if (!event.sourceTurnId) {
      unassigned.push(event);
      continue;
    }
    const values = grouped.get(event.sourceTurnId) ?? [];
    values.push(event);
    grouped.set(event.sourceTurnId, values);
  }
  const candidates = [...grouped.entries()].toSorted((left, right) =>
    left[1][0].timestamp.localeCompare(right[1][0].timestamp) || left[0].localeCompare(right[0])
  ).map(([sourceTurnId, turnEvents], index): Candidate => ({
    id: `candidate-${sessionId}-${index + 1}`,
    projectRef: turnEvents[0].projectRef,
    projectLabel: turnEvents[0].projectLabel,
    sourceSessionId: sessionId,
    sourceTurnIds: [sourceTurnId],
    events: turnEvents,
    anchors: extractAnchors(turnEvents),
  }));
  if (candidates.length === 0 && unassigned.length > 0) {
    candidates.push({
      id: `candidate-${sessionId}-1`,
      projectRef: unassigned[0].projectRef,
      projectLabel: unassigned[0].projectLabel,
      sourceSessionId: sessionId,
      sourceTurnIds: [],
      events: unassigned,
      anchors: extractAnchors(unassigned),
    });
  } else if (unassigned.length > 0) {
    for (const event of unassigned) {
      const candidate = candidates.toSorted((left, right) => {
        const leftDistance = Math.abs(
          Date.parse(event.timestamp) - Date.parse(left.events[0]?.timestamp ?? ""),
        );
        const rightDistance = Math.abs(
          Date.parse(event.timestamp) - Date.parse(right.events[0]?.timestamp ?? ""),
        );
        return leftDistance - rightDistance || left.id.localeCompare(right.id);
      })[0];
      candidate?.events.push(event);
    }
  }
  for (const candidate of candidates) {
    candidate.events.sort((left, right) =>
      left.timestamp.localeCompare(right.timestamp) || left.eventId.localeCompare(right.eventId)
    );
  }
  return candidates;
}

function sessionCandidates(sessionId: string, events: UnifiedEvent[]): Candidate[] {
  if (events.some((event) => event.sourceTurnId && isUserGoal(event))) {
    return turnFirstSessionCandidates(sessionId, events);
  }
  if (
    events.some((event) => event.sourceTurnId) &&
    events.some((event) => event.parentSourceSessionId)
  ) {
    return delegatedTurnCandidates(sessionId, events);
  }
  return legacySessionCandidates(sessionId, events);
}

function overlap(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((value) => right.has(value));
}

function nearby(left: Candidate, right: Candidate): boolean {
  const leftEnd = Date.parse(left.events.at(-1)?.timestamp ?? "");
  const rightStart = Date.parse(right.events[0]?.timestamp ?? "");
  return Math.abs(rightStart - leftEnd) <= NEARBY_MS;
}

function parentSessions(candidate: Candidate): Set<string> {
  return new Set(
    candidate.events.flatMap((event) =>
      event.parentSourceSessionId ? [event.parentSourceSessionId] : []
    ),
  );
}

function siblingBatchKeys(candidates: Candidate[]): Map<string, Set<string>> {
  const byParent = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    for (const parent of parentSessions(candidate)) {
      const values = byParent.get(parent) ?? [];
      values.push(candidate);
      byParent.set(parent, values);
    }
  }
  const keys = new Map<string, Set<string>>();
  for (const [parent, values] of byParent) {
    const ordered = values.toSorted((left, right) =>
      left.events[0].timestamp.localeCompare(right.events[0].timestamp) ||
      left.id.localeCompare(right.id)
    );
    let batch = 0;
    let anchor = Date.parse(ordered[0]?.events[0]?.timestamp ?? "");
    for (const candidate of ordered) {
      const start = Date.parse(candidate.events[0]?.timestamp ?? "");
      if (Number.isFinite(start) && Number.isFinite(anchor) && start - anchor > NEARBY_MS) {
        batch++;
        anchor = start;
      }
      const candidateKeys = keys.get(candidate.id) ?? new Set<string>();
      candidateKeys.add(`${parent}:${batch}`);
      keys.set(candidate.id, candidateKeys);
    }
  }
  return keys;
}

function parentSegmentForChild(
  child: Candidate,
  parentCandidates: Candidate[],
): Candidate | undefined {
  if (parentCandidates.length === 0) return undefined;
  const childStart = Date.parse(child.events[0]?.timestamp ?? "");
  if (!Number.isFinite(childStart)) return undefined;
  const explicit = parentCandidates.flatMap((candidate) => {
    const distances = candidate.events.filter((event) =>
      event.subagentRunId === child.sourceSessionId
    ).map((event) => Math.abs(childStart - Date.parse(event.timestamp))).filter(Number.isFinite);
    return distances.length > 0 ? [{ candidate, distance: Math.min(...distances) }] : [];
  });
  if (explicit.length > 0) {
    return explicit.toSorted((left, right) =>
      left.distance - right.distance ||
      right.candidate.events[0].timestamp.localeCompare(left.candidate.events[0].timestamp) ||
      left.candidate.id.localeCompare(right.candidate.id)
    )[0].candidate;
  }
  const ranked = parentCandidates.map((candidate) => {
    const start = Date.parse(candidate.events[0]?.timestamp ?? "");
    const end = Date.parse(candidate.events.at(-1)?.timestamp ?? "");
    const contains = Number.isFinite(start) && Number.isFinite(end) && childStart >= start &&
      childStart <= end;
    const distance = contains ? 0 : Math.min(
      Number.isFinite(start) ? Math.abs(childStart - start) : Number.POSITIVE_INFINITY,
      Number.isFinite(end) ? Math.abs(childStart - end) : Number.POSITIVE_INFINITY,
    );
    return { candidate, contains, distance, start };
  }).filter((value) => Number.isFinite(value.distance)).toSorted((left, right) =>
    Number(right.contains) - Number(left.contains) ||
    left.distance - right.distance ||
    right.start - left.start ||
    left.candidate.id.localeCompare(right.candidate.id)
  );
  const best = ranked[0];
  const hasStrongParentIdentity = best &&
    parentSessions(child).has(best.candidate.sourceSessionId);
  return best && (best.distance <= NEARBY_MS || hasStrongParentIdentity)
    ? best.candidate
    : undefined;
}

function candidateDistance(left: Candidate, right: Candidate): number {
  const leftStart = Date.parse(left.events[0]?.timestamp ?? "");
  const leftEnd = Date.parse(left.events.at(-1)?.timestamp ?? "");
  const rightStart = Date.parse(right.events[0]?.timestamp ?? "");
  const rightEnd = Date.parse(right.events.at(-1)?.timestamp ?? "");
  return Math.min(
    Math.abs(leftStart - rightStart),
    Math.abs(leftStart - rightEnd),
    Math.abs(leftEnd - rightStart),
    Math.abs(leftEnd - rightEnd),
  );
}

function parentSegmentLinks(
  candidates: Candidate[],
  siblingBatches: Map<string, Set<string>>,
): Map<string, string> {
  const bySession = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const values = bySession.get(candidate.sourceSessionId) ?? [];
    values.push(candidate);
    bySession.set(candidate.sourceSessionId, values);
  }
  const links = new Map<string, string>();
  for (const child of candidates) {
    const explicitParents = candidates.filter((candidate) =>
      candidate.sourceSessionId !== child.sourceSessionId &&
      candidate.events.some((event) => event.subagentRunId === child.sourceSessionId)
    );
    if (
      child.events.some(isUserGoal) &&
      (parentSessions(child).size === 0 || explicitParents.length === 0)
    ) continue;
    const parents = [
      ...explicitParents,
      ...[...parentSessions(child)].flatMap((parentId) => bySession.get(parentId) ?? []),
    ].filter((candidate, index, values) =>
      values.findIndex((value) => value.id === candidate.id) === index
    );
    const parent = parentSegmentForChild(child, parents);
    if (parent) links.set(child.id, parent.id);
  }
  const byParentCandidate = new Map<string, Candidate[]>();
  for (const child of candidates) {
    const parentId = links.get(child.id);
    const parent = candidates.find((candidate) => candidate.id === parentId);
    if (
      !parent ||
      parent.events.some((event) => event.subagentRunId === child.sourceSessionId)
    ) continue;
    const values = byParentCandidate.get(parent.id) ?? [];
    values.push(child);
    byParentCandidate.set(parent.id, values);
  }
  for (const [parentId, children] of byParentCandidate) {
    const parent = candidates.find((candidate) => candidate.id === parentId);
    if (!parent) continue;
    const batches = new Map<string, Candidate[]>();
    for (const child of children) {
      const batch = [...(siblingBatches.get(child.id) ?? [])].find((key) =>
        key.startsWith(`${parent.sourceSessionId}:`)
      );
      if (!batch) continue;
      const values = batches.get(batch) ?? [];
      values.push(child);
      batches.set(batch, values);
    }
    if (batches.size <= 1) continue;
    const selected = [...batches.entries()].toSorted((left, right) => {
      const leftDistance = Math.min(...left[1].map((child) => candidateDistance(parent, child)));
      const rightDistance = Math.min(...right[1].map((child) => candidateDistance(parent, child)));
      return leftDistance - rightDistance || left[0].localeCompare(right[0]);
    })[0]?.[0];
    for (const [batch, batchChildren] of batches) {
      if (batch === selected) continue;
      for (const child of batchChildren) links.delete(child.id);
    }
  }
  return links;
}

function relationFor(
  left: Candidate,
  right: Candidate,
  index: number,
  siblingBatches: Map<string, Set<string>>,
  parentLinks: Map<string, string>,
): TaskRelation | undefined {
  const leftDelegates = parentLinks.get(right.id) === left.id &&
    left.events.some((event) => event.subagentRunId === right.sourceSessionId);
  const rightDelegates = parentLinks.get(left.id) === right.id &&
    right.events.some((event) => event.subagentRunId === left.sourceSessionId);
  if (leftDelegates || rightDelegates) {
    const evidence = (leftDelegates ? left : right).events.find((event) =>
      event.subagentRunId === (leftDelegates ? right.sourceSessionId : left.sourceSessionId)
    );
    return {
      id: `relation-${index}`,
      fromTaskId: left.id,
      toTaskId: right.id,
      fromSessionId: left.sourceSessionId,
      toSessionId: right.sourceSessionId,
      type: "delegation",
      evidenceEventIds: evidence ? [evidence.eventId] : [],
      confidence: 0.95,
      merged: true,
    };
  }
  const leftParents = parentSessions(left);
  const rightParents = parentSessions(right);
  const leftIsChild = parentLinks.get(left.id) === right.id;
  const rightIsChild = parentLinks.get(right.id) === left.id;
  const linkedChild = leftIsChild ? left : rightIsChild ? right : undefined;
  const linkedParent = leftIsChild ? right : rightIsChild ? left : undefined;
  const strongParentIdentity = Boolean(
    linkedChild && linkedParent &&
      parentSessions(linkedChild).has(linkedParent.sourceSessionId),
  );
  const sharedParent = overlap(leftParents, rightParents).length > 0;
  const sameSiblingBatch = overlap(
    siblingBatches.get(left.id) ?? new Set<string>(),
    siblingBatches.get(right.id) ?? new Set<string>(),
  ).length > 0;
  const linkedSiblingBatch = sharedParent && sameSiblingBatch &&
    parentLinks.has(left.id) && parentLinks.get(left.id) === parentLinks.get(right.id);
  if (
    (leftIsChild || rightIsChild) && (nearby(left, right) || strongParentIdentity) ||
    linkedSiblingBatch
  ) {
    const child = leftIsChild ? left : rightIsChild ? right : left;
    const evidence = child.events.find((event) => event.parentSourceSessionId);
    return {
      id: `relation-${index}`,
      fromTaskId: left.id,
      toTaskId: right.id,
      fromSessionId: left.sourceSessionId,
      toSessionId: right.sourceSessionId,
      type: "delegation",
      evidenceEventIds: evidence ? [evidence.eventId] : [],
      confidence: leftIsChild || rightIsChild ? 0.93 : 0.88,
      merged: true,
    };
  }
  const shared = overlap(left.anchors, right.anchors);
  const relationShared = shared.filter((anchor) =>
    anchor.startsWith("github:") ||
    left.projectRef === right.projectRef
  );
  // A shared file path is a related deliverable, but it is not enough to
  // prove that two sessions are a continuation of the same user goal.
  const continuationShared = relationShared.filter((anchor) => !anchor.startsWith("artifact:"));
  if (relationShared.length > 0) {
    const firstRightGoal = right.events.find(isUserGoal);
    const continued = Boolean(
      continuationShared.length > 0 && firstRightGoal &&
        CONTINUATION.test(firstRightGoal.contentPreview?.trim() ?? ""),
    );
    return {
      id: `relation-${index}`,
      fromTaskId: left.id,
      toTaskId: right.id,
      fromSessionId: left.sourceSessionId,
      toSessionId: right.sourceSessionId,
      type: continued ? "continuation" : "shared_deliverable",
      evidenceEventIds: [...left.events, ...right.events].filter(isUserGoal).map((event) =>
        event.eventId
      ),
      confidence: continued ? 0.92 : 0.86,
      merged: continued,
    };
  }
  if (left.projectRef && left.projectRef === right.projectRef && nearby(left, right)) {
    return {
      id: `relation-${index}`,
      fromTaskId: left.id,
      toTaskId: right.id,
      fromSessionId: left.sourceSessionId,
      toSessionId: right.sourceSessionId,
      type: "candidate",
      evidenceEventIds: [],
      confidence: 0.35,
      merged: false,
    };
  }
  return undefined;
}

export function reconstructTaskBoundaries(
  events: UnifiedEvent[],
  window: ReportWindow,
): TaskBoundaryResult {
  backfillLegacySourceTurns(events);
  const sessions = new Map<string, UnifiedEvent[]>();
  for (const event of events) {
    const values = sessions.get(event.sourceSessionId) ?? [];
    values.push(event);
    sessions.set(event.sourceSessionId, values);
  }
  const candidates = [...sessions.entries()].flatMap(([sessionId, sessionEvents]) =>
    sessionCandidates(sessionId, sessionEvents)
  ).toSorted((left, right) =>
    left.events[0].timestamp.localeCompare(right.events[0].timestamp) ||
    left.id.localeCompare(right.id)
  );
  const parent = new Map(candidates.map((candidate) => [candidate.id, candidate.id]));
  const find = (id: string): string => {
    const value = parent.get(id) ?? id;
    if (value === id) return value;
    const root = find(value);
    parent.set(id, root);
    return root;
  };
  const rawRelations: TaskRelation[] = [];
  const siblingBatches = siblingBatchKeys(candidates);
  const parentLinks = parentSegmentLinks(candidates, siblingBatches);
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex++) {
      const left = candidates[leftIndex];
      const right = candidates[rightIndex];
      if (left.sourceSessionId === right.sourceSessionId) continue;
      const relation = relationFor(
        left,
        right,
        rawRelations.length + 1,
        siblingBatches,
        parentLinks,
      );
      if (!relation) continue;
      rawRelations.push(relation);
      if (relation.merged) parent.set(find(right.id), find(left.id));
    }
  }
  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const root = find(candidate.id);
    const values = groups.get(root) ?? [];
    values.push(candidate);
    groups.set(root, values);
  }
  const orderedGroups = [...groups.values()]
    .filter((group) => group.some((candidate) => candidate.events.some(isUserGoal)))
    .toSorted((left, right) =>
      left[0].events[0].timestamp.localeCompare(right[0].events[0].timestamp)
    );
  const candidateToTask = new Map<string, string>();
  const tasks = orderedGroups.map((group, index): TaskBoundary => {
    const id = `task-${index + 1}`;
    for (const candidate of group) candidateToTask.set(candidate.id, id);
    const taskEvents = group.flatMap((candidate) => candidate.events).toSorted((left, right) =>
      left.timestamp.localeCompare(right.timestamp) || left.eventId.localeCompare(right.eventId)
    );
    const firstGoal = taskEvents.find(isUserGoal);
    return {
      id,
      name: cleanTitle(firstGoal?.contentPreview, taskEvents[0].timestamp),
      projectRef: group.find((candidate) => candidate.projectRef)?.projectRef,
      projectLabel: inferredProjectLabel(
        taskEvents,
        group.find((candidate) => candidate.projectLabel)?.projectLabel,
      ),
      sourceSessionIds: [...new Set(group.map((candidate) => candidate.sourceSessionId))].sort(),
      sourceTurnIds: [...new Set(group.flatMap((candidate) => candidate.sourceTurnIds))].sort(),
      eventIds: taskEvents.map((event) => event.eventId),
      events: taskEvents,
      start: taskEvents[0].timestamp,
      end: taskEvents.at(-1)?.timestamp ?? taskEvents[0].timestamp,
      activeMinutes: unionActiveMinutes(taskEvents, window),
      confidence: firstGoal ? (group.length > 1 ? 0.9 : 0.75) : 0.45,
      relationIds: [],
    };
  });
  const relations: TaskRelation[] = [];
  const weakRelationKeys = new Set<string>();
  for (const relation of rawRelations) {
    const fromTaskId = candidateToTask.get(relation.fromTaskId);
    const toTaskId = candidateToTask.get(relation.toTaskId);
    if (!fromTaskId || !toTaskId) continue;
    relation.fromTaskId = fromTaskId;
    relation.toTaskId = toTaskId;
    if (relation.fromTaskId === relation.toTaskId) continue;
    if (!relation.merged) {
      const taskIds = [relation.fromTaskId, relation.toTaskId].sort();
      const key = `${relation.type}:${taskIds.join(":")}`;
      if (weakRelationKeys.has(key)) continue;
      weakRelationKeys.add(key);
    }
    relations.push(relation);
    for (const taskId of new Set([relation.fromTaskId, relation.toTaskId])) {
      tasks.find((task) => task.id === taskId)?.relationIds.push(relation.id);
    }
  }
  return { tasks, relations };
}
