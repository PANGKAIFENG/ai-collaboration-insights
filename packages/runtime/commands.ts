import { atomicWriteJson, readJson } from "../core/io.ts";
import { ensureOwnedDataDirectory } from "./scheduler.ts";

export interface ConsentState {
  schemaVersion: "1";
  disclosureVersion: "1";
  granted: boolean;
  grantedAt?: string;
  revokedAt?: string;
  scope?: "daily_standard";
}

export const CONSENT_DISCLOSURE =
  "标准分析会把脱敏后的任务名、成果候选、有限消息片段、指标和证据 ID 发送给 Codex；不会发送凭据、完整代码、完整工具输出或无关历史。";

export async function readConsent(path: string): Promise<ConsentState> {
  return await readJson<ConsentState>(path, {
    schemaVersion: "1",
    disclosureVersion: "1",
    granted: false,
  });
}

export async function grantConsent(path: string, now = new Date()): Promise<ConsentState> {
  const state: ConsentState = {
    schemaVersion: "1",
    disclosureVersion: "1",
    granted: true,
    grantedAt: now.toISOString(),
    scope: "daily_standard",
  };
  const parent = path.slice(0, path.lastIndexOf("/"));
  await ensureOwnedDataDirectory(parent);
  await atomicWriteJson(path, state);
  return state;
}

export async function revokeConsent(path: string, now = new Date()): Promise<ConsentState> {
  const state: ConsentState = {
    schemaVersion: "1",
    disclosureVersion: "1",
    granted: false,
    revokedAt: now.toISOString(),
  };
  const parent = path.slice(0, path.lastIndexOf("/"));
  await ensureOwnedDataDirectory(parent);
  await atomicWriteJson(path, state);
  return state;
}
