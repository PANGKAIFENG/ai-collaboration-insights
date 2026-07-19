import { assert, assertEquals } from "../_assert.ts";

const decoder = new TextDecoder();

async function runCli(args: string[], env?: Record<string, string>) {
  const command = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--allow-read",
      "--allow-write",
      "--allow-env",
      "--allow-run",
      "apps/cli/main.ts",
      ...args,
    ],
    cwd: new URL("../..", import.meta.url),
    env,
    stdout: "piped",
    stderr: "piped",
  });
  const output = await command.output();
  return {
    code: output.code,
    stdout: decoder.decode(output.stdout).trim(),
    stderr: decoder.decode(output.stderr).trim(),
  };
}

Deno.test("version prints the semantic version", async () => {
  const result = await runCli(["version"]);
  assertEquals(result.code, 0);
  assertEquals(result.stdout, "0.3.0");
  assertEquals(result.stderr, "");
});

Deno.test("doctor reports local readiness without exposing paths", async () => {
  const root = await Deno.makeTempDir();
  const home = `${root}/home`;
  await Deno.mkdir(`${home}/.codex/sessions`, { recursive: true });
  try {
    const result = await runCli(["doctor"], { HOME: home, CODEX_HOME: `${home}/.codex` });
    assertEquals(result.code, 0);
    const status = JSON.parse(result.stdout);
    assertEquals(status.version, "0.3.0");
    assertEquals(status.codexSessions, "ready");
    assert(!result.stdout.includes(home));
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("schedule status and data purge use the current user application paths", async () => {
  const root = await Deno.makeTempDir();
  const home = `${root}/home`;
  const dataDir = `${home}/Library/Application Support/ai-collaboration-insights`;
  await Deno.mkdir(`${home}/.codex/sessions`, { recursive: true });
  await Deno.mkdir(dataDir, { recursive: true });
  await Deno.writeTextFile(
    `${dataDir}/.aci-owned.json`,
    '{"schemaVersion":"1","app":"ai-collaboration-insights"}\n',
  );
  try {
    const status = await runCli(["schedule", "status"], {
      HOME: home,
      CODEX_HOME: `${home}/.codex`,
    });
    assertEquals(status.code, 0);
    assertEquals(JSON.parse(status.stdout).status, "not_installed");

    const purge = await runCli(["data", "purge"], {
      HOME: home,
      CODEX_HOME: `${home}/.codex`,
    });
    assertEquals(purge.code, 0);
    assertEquals(JSON.parse(purge.stdout).status, "purged");
    let removed = false;
    try {
      await Deno.stat(dataDir);
    } catch (error) {
      removed = error instanceof Deno.errors.NotFound;
    }
    assert(removed);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("unknown command returns a stable usage error", async () => {
  const result = await runCli(["unknown"]);
  assertEquals(result.code, 2);
  assert(result.stderr.includes("ACI_USAGE"));
});
