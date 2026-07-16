import type { ReportWindow, TaskRelation, UnifiedEvent } from "../core/types.ts";
import { unionActiveMinutes } from "./facts.ts";

const NEARBY_MS = 20 * 60 * 1000;
const TRANSITION =
  /^(?:另外(?:一个)?任务|另一个任务|新任务|接下来(?:请)?|现在(?:请)?(?:实现|开发|创建|排查))\s*[：:，,]?\s*/i;
const CONTINUATION = /^(?:继续|接着|补充|修复|调整|验证|重试|再)/i;

export interface TaskBoundary {
  id: string;
  name: string;
  projectRef?: string;
  projectLabel?: string;
  sourceSessionIds: string[];
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
  events: UnifiedEvent[];
  anchors: Set<string>;
}

function isScaffolding(event: UnifiedEvent): boolean {
  if (event.kind !== "message") return false;
  if (event.role === "developer") return true;
  const text = event.contentPreview?.trim() ?? "";
  return /^(?:#\s*AGENTS\.md instructions|<environment_context>|#\s*Developer instructions|<INSTRUCTIONS>|#\s*(?:Files|Applications) mentioned by the user\s*:|Automation\s*:)/i
    .test(text);
}

function isUserGoal(event: UnifiedEvent): boolean {
  return event.kind === "message" && event.role === "user" && !isScaffolding(event);
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

function clearTransition(previous: UnifiedEvent | undefined, current: UnifiedEvent): boolean {
  const currentText = current.contentPreview?.trim() ?? "";
  if (TRANSITION.test(currentText)) return true;
  if (CONTINUATION.test(currentText)) return false;
  const previousAnchors = previous ? extractAnchors([previous]) : new Set<string>();
  const currentAnchors = extractAnchors([current]);
  return previousAnchors.size > 0 && currentAnchors.size > 0 &&
    ![...currentAnchors].some((anchor) => previousAnchors.has(anchor));
}

function sessionCandidates(sessionId: string, events: UnifiedEvent[]): Candidate[] {
  const ordered = events.filter(isActivity).toSorted((left, right) =>
    left.timestamp.localeCompare(right.timestamp) || left.eventId.localeCompare(right.eventId)
  );
  const candidates: Candidate[] = [];
  let current: UnifiedEvent[] | undefined;
  let previousGoal: UnifiedEvent | undefined;
  for (const event of ordered) {
    if (isScaffolding(event)) continue;
    if (isUserGoal(event)) {
      if (!current || clearTransition(previousGoal, event)) {
        current = [];
        candidates.push({
          id: `candidate-${sessionId}-${candidates.length + 1}`,
          projectRef: event.projectRef,
          projectLabel: event.projectLabel,
          sourceSessionId: sessionId,
          events: current,
          anchors: new Set(),
        });
      }
      previousGoal = event;
    }
    if (current) current.push(event);
  }
  if (candidates.length === 0) {
    const orphanEvents = ordered.filter((event) => !isScaffolding(event));
    if (orphanEvents.length > 0) {
      candidates.push({
        id: `candidate-${sessionId}-1`,
        projectRef: orphanEvents[0].projectRef,
        projectLabel: orphanEvents[0].projectLabel,
        sourceSessionId: sessionId,
        events: orphanEvents,
        anchors: new Set(),
      });
    }
  }
  for (const candidate of candidates) candidate.anchors = extractAnchors(candidate.events);
  return candidates;
}

function overlap(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((value) => right.has(value));
}

function nearby(left: Candidate, right: Candidate): boolean {
  const leftEnd = Date.parse(left.events.at(-1)?.timestamp ?? "");
  const rightStart = Date.parse(right.events[0]?.timestamp ?? "");
  return Math.abs(rightStart - leftEnd) <= NEARBY_MS;
}

function relationFor(left: Candidate, right: Candidate, index: number): TaskRelation | undefined {
  const leftDelegates = left.events.some((event) => event.subagentRunId === right.sourceSessionId);
  const rightDelegates = right.events.some((event) => event.subagentRunId === left.sourceSessionId);
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
  const shared = overlap(left.anchors, right.anchors);
  const strongShared = shared.filter((anchor) =>
    !anchor.startsWith("artifact:") && !anchor.startsWith("reference:") ||
    left.projectRef === right.projectRef
  );
  if (strongShared.length > 0) {
    const continued = right.events.some((event) =>
      isUserGoal(event) && CONTINUATION.test(event.contentPreview?.trim() ?? "")
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
      merged: true,
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
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex++) {
      const left = candidates[leftIndex];
      const right = candidates[rightIndex];
      if (left.sourceSessionId === right.sourceSessionId) continue;
      const relation = relationFor(left, right, rawRelations.length + 1);
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
      projectLabel: group.find((candidate) => candidate.projectLabel)?.projectLabel,
      sourceSessionIds: [...new Set(group.map((candidate) => candidate.sourceSessionId))].sort(),
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
    if (!relation.merged && relation.fromTaskId === relation.toTaskId) continue;
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
