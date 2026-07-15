import type { ReportWindow, UnifiedEvent } from "../core/types.ts";
import { sha256 } from "../core/io.ts";
import { resolveContainedFile } from "../core/paths.ts";
import { createParserState, parseCodexLine } from "./parser.ts";

export interface ScanLimits {
  maxLineBytes: number;
  maxEvents: number;
  maxPreviewChars: number;
}

export interface ScanResult {
  status: "available" | "no_data" | "not_found" | "permission_denied";
  events: UnifiedEvent[];
  fingerprint: string;
  diagnostics: {
    filesDiscovered: number;
    linesRead: number;
    skippedLines: number;
    unknownEvents: number;
    duplicateEvents: number;
    truncated: boolean;
  };
}

interface ScanOptions {
  root: string;
  window: ReportWindow;
  limits?: Partial<ScanLimits>;
}

const DEFAULT_LIMITS: ScanLimits = {
  maxLineBytes: 1024 * 1024,
  maxEvents: 200_000,
  maxPreviewChars: 500,
};

async function discoverJsonl(root: string): Promise<string[]> {
  const resolvedRoot = await Deno.realPath(root);
  const files: string[] = [];

  async function walk(directory: string): Promise<void> {
    for await (const entry of Deno.readDir(directory)) {
      const path = `${directory}/${entry.name}`;
      if (entry.isSymlink) continue;
      if (entry.isDirectory) await walk(path);
      else if (entry.isFile && entry.name.endsWith(".jsonl")) {
        files.push(await resolveContainedFile(resolvedRoot, path, ".jsonl"));
      }
    }
  }

  await walk(resolvedRoot);
  return files.sort();
}

async function* streamLines(
  path: string,
  maxLineBytes: number,
): AsyncGenerator<{ line?: string; oversized: boolean }> {
  const file = await Deno.open(path, { read: true });
  const reader = file.readable.pipeThrough(new TextDecoderStream()).getReader();
  let pending = "";
  let discarding = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += value;
      while (true) {
        const newline = pending.indexOf("\n");
        if (newline < 0) break;
        const line = pending.slice(0, newline).replace(/\r$/, "");
        pending = pending.slice(newline + 1);
        if (discarding || new TextEncoder().encode(line).length > maxLineBytes) {
          yield { oversized: true };
          discarding = false;
        } else {
          yield { line, oversized: false };
        }
      }
      if (new TextEncoder().encode(pending).length > maxLineBytes) {
        pending = "";
        discarding = true;
      }
    }
    if (discarding || new TextEncoder().encode(pending).length > maxLineBytes) {
      yield { oversized: true };
    } else if (pending.length > 0) {
      yield { line: pending.replace(/\r$/, ""), oversized: false };
    }
  } finally {
    reader.releaseLock();
  }
}

export async function scanCodexWindow(options: ScanOptions): Promise<ScanResult> {
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  const diagnostics = {
    filesDiscovered: 0,
    linesRead: 0,
    skippedLines: 0,
    unknownEvents: 0,
    duplicateEvents: 0,
    truncated: false,
  };
  let files: string[];
  try {
    files = await discoverJsonl(options.root);
  } catch (error) {
    const status = error instanceof Deno.errors.NotFound
      ? "not_found"
      : error instanceof Deno.errors.PermissionDenied
      ? "permission_denied"
      : undefined;
    if (!status) throw error;
    return { status, events: [], fingerprint: await sha256(""), diagnostics };
  }
  diagnostics.filesDiscovered = files.length;
  const events = new Map<string, UnifiedEvent>();

  for (const file of files) {
    const state = createParserState();
    let lineNumber = 0;
    for await (const item of streamLines(file, limits.maxLineBytes)) {
      diagnostics.linesRead++;
      if (item.oversized || item.line === undefined) {
        diagnostics.skippedLines++;
        lineNumber++;
        continue;
      }
      const parsed = await parseCodexLine(item.line, lineNumber++, state, limits);
      if (parsed.status === "skipped") {
        diagnostics.skippedLines++;
        continue;
      }
      const inWindow = parsed.timestamp !== undefined && parsed.timestamp >= options.window.start &&
        parsed.timestamp < options.window.end;
      if (parsed.status === "unknown" && inWindow) diagnostics.unknownEvents++;
      if (!parsed.event || !inWindow) continue;
      if (events.has(parsed.event.eventId)) {
        diagnostics.duplicateEvents++;
        continue;
      }
      events.set(parsed.event.eventId, parsed.event);
      if (events.size >= limits.maxEvents) {
        diagnostics.truncated = true;
        break;
      }
    }
    if (diagnostics.truncated) break;
  }

  const ordered = [...events.values()].sort((left, right) =>
    left.timestamp.localeCompare(right.timestamp) || left.eventId.localeCompare(right.eventId)
  );
  const fingerprint = await sha256(JSON.stringify(ordered.map((event) => ({
    id: event.eventId,
    usage: event.usage,
    availability: event.availability,
  }))));
  return {
    status: ordered.length > 0 ? "available" : "no_data",
    events: ordered,
    fingerprint,
    diagnostics,
  };
}
