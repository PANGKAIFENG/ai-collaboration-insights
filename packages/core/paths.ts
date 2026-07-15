const APP_NAME = "ai-collaboration-insights";

export interface AppPaths {
  home: string;
  dataDir: string;
  reportsDir: string;
  logsDir: string;
  tmpDir: string;
  manifestFile: string;
  consentFile: string;
  launchAgentFile: string;
}

export function appPaths(home = Deno.env.get("HOME")): AppPaths {
  if (!home || !home.startsWith("/")) throw new Error("HOME must be an absolute path");
  const dataDir = `${home}/Library/Application Support/${APP_NAME}`;
  return {
    home,
    dataDir,
    reportsDir: `${dataDir}/reports`,
    logsDir: `${dataDir}/logs`,
    tmpDir: `${dataDir}/tmp`,
    manifestFile: `${dataDir}/manifest.json`,
    consentFile: `${dataDir}/consent.json`,
    launchAgentFile: `${home}/Library/LaunchAgents/com.ai-collaboration-insights.daily.plist`,
  };
}

export function codexSessionsRoot(
  home = Deno.env.get("CODEX_HOME") ?? `${Deno.env.get("HOME")}/.codex`,
): string {
  if (!home || !home.startsWith("/")) throw new Error("CODEX_HOME must be an absolute path");
  return `${home}/sessions`;
}

function isContained(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}/`);
}

export async function resolveContainedFile(
  rootPath: string,
  candidatePath: string,
  extension: string,
): Promise<string> {
  const root = await Deno.realPath(rootPath);
  const candidate = await Deno.realPath(candidatePath);
  if (!isContained(root, candidate)) throw new Error("file is outside source root");
  if (!candidate.endsWith(extension)) throw new Error(`unsupported source extension: ${candidate}`);
  const info = await Deno.stat(candidate);
  if (!info.isFile) throw new Error("source candidate is not a regular file");
  return candidate;
}

export async function ensureAppDirectories(paths: AppPaths): Promise<void> {
  for (const path of [paths.dataDir, paths.reportsDir, paths.logsDir, paths.tmpDir]) {
    await Deno.mkdir(path, { recursive: true, mode: 0o700 });
  }
}
