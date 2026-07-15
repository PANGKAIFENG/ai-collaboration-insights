import { atomicWriteText } from "../core/io.ts";
import { appPaths } from "../core/paths.ts";

const LABEL = "com.ai-collaboration-insights.daily";
const OWNERSHIP_FILE = ".aci-owned.json";

export type CommandRunner = (command: string, args: string[]) => Promise<number>;

export interface ScheduleOptions {
  home: string;
  binaryPath: string;
  uid?: number;
  runner?: CommandRunner;
}

function xml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

export function renderLaunchAgent(options: { binaryPath: string; logDir: string }): string {
  const binaryPath = xml(options.binaryPath);
  const logDir = xml(options.logDir);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${binaryPath}</string>
    <string>report</string>
    <string>--scheduled</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>19</integer><key>Minute</key><integer>0</integer></dict>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${logDir}/schedule.log</string>
  <key>StandardErrorPath</key><string>${logDir}/schedule.error.log</string>
</dict>
</plist>
`;
}

async function defaultRunner(command: string, args: string[]): Promise<number> {
  const output = await new Deno.Command(command, { args, stdout: "null", stderr: "null" }).output();
  return output.code;
}

async function resolveUid(uid?: number): Promise<number> {
  if (uid !== undefined) return uid;
  const output = await new Deno.Command("/usr/bin/id", {
    args: ["-u"],
    stdout: "piped",
    stderr: "null",
  }).output();
  const value = Number(new TextDecoder().decode(output.stdout).trim());
  if (!output.success || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("unable to determine user id");
  }
  return value;
}

export async function installSchedule(
  options: ScheduleOptions,
): Promise<{ status: "installed"; plistPath: string }> {
  const paths = appPaths(options.home);
  if (!options.binaryPath.startsWith("/")) throw new Error("binary path must be absolute");
  await ensureOwnedDataDirectory(paths.dataDir);
  await Deno.mkdir(`${options.home}/Library/LaunchAgents`, { recursive: true, mode: 0o700 });
  await Deno.mkdir(paths.logsDir, { recursive: true, mode: 0o700 });
  await atomicWriteText(
    paths.launchAgentFile,
    renderLaunchAgent({ binaryPath: options.binaryPath, logDir: paths.logsDir }),
  );
  const runner = options.runner ?? defaultRunner;
  const domain = `gui/${await resolveUid(options.uid)}`;
  await runner("/bin/launchctl", ["bootout", domain, paths.launchAgentFile]);
  const code = await runner("/bin/launchctl", ["bootstrap", domain, paths.launchAgentFile]);
  if (code !== 0) throw new Error(`launchctl bootstrap failed with exit code ${code}`);
  return { status: "installed", plistPath: paths.launchAgentFile };
}

export async function scheduleStatus(
  options: { home: string; uid?: number; runner?: CommandRunner },
): Promise<{ status: "not_installed" | "installed" | "loaded" }> {
  const paths = appPaths(options.home);
  try {
    const info = await Deno.lstat(paths.launchAgentFile);
    if (info.isSymlink || !info.isFile) return { status: "not_installed" };
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return { status: "not_installed" };
    throw error;
  }
  const runner = options.runner ?? defaultRunner;
  const domain = `gui/${await resolveUid(options.uid)}`;
  const code = await runner("/bin/launchctl", ["print", `${domain}/${LABEL}`]);
  return { status: code === 0 ? "loaded" : "installed" };
}

export async function removeSchedule(
  options: { home: string; uid?: number; runner?: CommandRunner },
): Promise<{ status: "removed"; plistPath: string }> {
  const paths = appPaths(options.home);
  const runner = options.runner ?? defaultRunner;
  const domain = `gui/${await resolveUid(options.uid)}`;
  await runner("/bin/launchctl", ["bootout", domain, paths.launchAgentFile]);
  try {
    await Deno.remove(paths.launchAgentFile);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  return { status: "removed", plistPath: paths.launchAgentFile };
}

function isContained(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}/`);
}

export async function purgeOwnedData(options: {
  dataDir: string;
  home: string;
  sourceRoot: string;
}): Promise<void> {
  if (![options.dataDir, options.home, options.sourceRoot].every((path) => path.startsWith("/"))) {
    throw new Error("purge paths must be absolute");
  }
  const info = await Deno.lstat(options.dataDir);
  if (info.isSymlink) throw new Error("refusing to purge a symlink");
  if (!info.isDirectory) throw new Error("data directory is not a directory");
  const dataDir = await Deno.realPath(options.dataDir);
  const home = await Deno.realPath(options.home);
  let sourceRoot = options.sourceRoot;
  try {
    sourceRoot = await Deno.realPath(options.sourceRoot);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  if (dataDir === "/" || dataDir === home || !isContained(home, dataDir)) {
    throw new Error("refusing to purge outside the user application directory");
  }
  if (isContained(sourceRoot, dataDir) || isContained(dataDir, sourceRoot)) {
    throw new Error("refusing to purge Codex source data");
  }
  const ownership = JSON.parse(await Deno.readTextFile(`${dataDir}/${OWNERSHIP_FILE}`));
  if (ownership?.schemaVersion !== "1" || ownership?.app !== "ai-collaboration-insights") {
    throw new Error("data directory is not owned by ai-collaboration-insights");
  }
  await Deno.remove(dataDir, { recursive: true });
}

export async function writeOwnershipMarker(dataDir: string): Promise<void> {
  await Deno.mkdir(dataDir, { recursive: true, mode: 0o700 });
  await atomicWriteText(
    `${dataDir}/${OWNERSHIP_FILE}`,
    `${JSON.stringify({ schemaVersion: "1", app: "ai-collaboration-insights" })}\n`,
  );
}

export async function ensureOwnedDataDirectory(dataDir: string): Promise<void> {
  let created = false;
  try {
    const info = await Deno.lstat(dataDir);
    if (info.isSymlink || !info.isDirectory) {
      throw new Error("application data directory must be an owned directory");
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
    await Deno.mkdir(dataDir, { recursive: true, mode: 0o700 });
    created = true;
  }
  if (created) {
    await writeOwnershipMarker(dataDir);
    return;
  }
  try {
    const ownership = JSON.parse(await Deno.readTextFile(`${dataDir}/${OWNERSHIP_FILE}`));
    if (ownership?.schemaVersion === "1" && ownership?.app === "ai-collaboration-insights") {
      return;
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound) && !(error instanceof SyntaxError)) throw error;
  }
  throw new Error("application data directory is not owned by ai-collaboration-insights");
}
