import { assert, assertEquals } from "../_assert.ts";
import {
  installSchedule,
  purgeOwnedData,
  removeSchedule,
  renderLaunchAgent,
} from "../../packages/runtime/scheduler.ts";

Deno.test("renders a fixed 19:00 RunAtLoad LaunchAgent without a shell", () => {
  const plist = renderLaunchAgent({
    binaryPath: "/Users/synthetic/.local/bin/aci",
    logDir: "/Users/synthetic/Library/Application Support/ai-collaboration-insights/logs",
  });
  assert(plist.includes("<key>Hour</key><integer>19</integer>"));
  assert(plist.includes("<key>Minute</key><integer>0</integer>"));
  assert(plist.includes("<key>RunAtLoad</key><true/>"));
  assert(plist.includes("<string>report</string>"));
  assert(plist.includes("<string>--scheduled</string>"));
  assert(!plist.includes("sh -c"));
});

Deno.test("installs and removes one user-domain schedule idempotently", async () => {
  const home = await Deno.makeTempDir();
  const commands: string[][] = [];
  const runner = (command: string, args: string[]) => {
    commands.push([command, ...args]);
    return Promise.resolve(0);
  };
  try {
    const installed = await installSchedule({
      home,
      binaryPath: `${home}/.local/bin/aci`,
      uid: 501,
      runner,
    });
    assertEquals(installed.status, "installed");
    assert(await exists(installed.plistPath));
    await installSchedule({ home, binaryPath: `${home}/.local/bin/aci`, uid: 501, runner });
    await removeSchedule({ home, uid: 501, runner });
    assert(!await exists(installed.plistPath));
    assert(commands.every((command) => command[0] === "/bin/launchctl"));
    assert(commands.every((command) => command[1] !== "bootstrap" || command[2] === "gui/501"));
  } finally {
    await Deno.remove(home, { recursive: true });
  }
});

Deno.test("purges only an explicitly owned non-symlink data directory", async () => {
  const home = await Deno.makeTempDir();
  const dataDir = `${home}/Library/Application Support/ai-collaboration-insights`;
  const outside = await Deno.makeTempDir();
  try {
    await Deno.mkdir(dataDir, { recursive: true });
    await Deno.writeTextFile(
      `${dataDir}/.aci-owned.json`,
      '{"schemaVersion":"1","app":"ai-collaboration-insights"}\n',
    );
    await Deno.writeTextFile(`${dataDir}/report.txt`, "derived");
    await purgeOwnedData({ dataDir, home, sourceRoot: `${home}/.codex/sessions` });
    assert(!await exists(dataDir));

    const link = `${home}/linked-data`;
    await Deno.symlink(outside, link);
    let rejected = false;
    try {
      await purgeOwnedData({ dataDir: link, home, sourceRoot: `${home}/.codex/sessions` });
    } catch (error) {
      rejected = error instanceof Error && error.message.includes("symlink");
    }
    assert(rejected);
    assert(await exists(outside));
  } finally {
    await Deno.remove(home, { recursive: true });
    await Deno.remove(outside, { recursive: true });
  }
});

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}
