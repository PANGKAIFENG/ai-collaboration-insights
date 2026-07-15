import { assert, assertEquals } from "../_assert.ts";

const decoder = new TextDecoder();

async function runCli(args: string[]) {
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
  assertEquals(result.stdout, "0.1.0");
  assertEquals(result.stderr, "");
});

Deno.test("unknown command returns a stable usage error", async () => {
  const result = await runCli(["unknown"]);
  assertEquals(result.code, 2);
  assert(result.stderr.includes("ACI_USAGE"));
});
