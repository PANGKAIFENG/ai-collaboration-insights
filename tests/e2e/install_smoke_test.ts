import { assert, assertEquals } from "../_assert.ts";

Deno.test("checksum installer and uninstaller preserve reports unless purge is explicit", async () => {
  const root = await Deno.makeTempDir();
  const home = `${root}/home`;
  const source = `${root}/release`;
  await Deno.mkdir(home);
  await Deno.mkdir(source);
  const arch = Deno.build.arch === "aarch64" ? "aarch64" : "x86_64";
  const asset = `aci-${arch}-apple-darwin`;
  const binary = `#!/bin/sh
case "$1 $2" in
  "version ") echo 0.2.0 ;;
  "schedule install"|"schedule remove") exit 0 ;;
  "data purge") rm -rf "$HOME/Library/Application Support/ai-collaboration-insights" ;;
esac
`;
  await Deno.writeTextFile(`${source}/${asset}`, binary, { mode: 0o755 });
  const bytes = await Deno.readFile(`${source}/${asset}`);
  const digestInput = new Uint8Array(bytes.byteLength);
  digestInput.set(bytes);
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", digestInput.buffer)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  await Deno.writeTextFile(`${source}/checksums.txt`, `${digest}  ${asset}\n`);
  try {
    const install = await run("sh", ["scripts/install.sh"], {
      HOME: home,
      ACI_INSTALL_SOURCE_DIR: source,
      ACI_SKIP_SCHEDULE: "1",
    });
    assertEquals(install.code, 0);
    const installed = `${home}/.local/bin/aci`;
    assert(await exists(installed));
    assertEquals((await run(installed, ["version"], { HOME: home })).stdout.trim(), "0.2.0");

    const dataDir = `${home}/Library/Application Support/ai-collaboration-insights`;
    await Deno.mkdir(`${dataDir}/reports`, { recursive: true });
    await Deno.writeTextFile(`${dataDir}/reports/report.html`, "derived");
    const uninstall = await run("sh", ["scripts/uninstall.sh"], { HOME: home });
    assertEquals(uninstall.code, 0);
    assert(!uninstall.stdout.includes("purge"));
    assert(!await exists(installed));
    assert(await exists(`${dataDir}/reports/report.html`));

    assertEquals(
      (await run("sh", ["scripts/install.sh"], {
        HOME: home,
        ACI_INSTALL_SOURCE_DIR: source,
        ACI_SKIP_SCHEDULE: "1",
      })).code,
      0,
    );
    assertEquals(
      (await run("sh", ["scripts/uninstall.sh", "--purge-data"], { HOME: home })).code,
      0,
    );
    assert(!await exists(dataDir));
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

async function run(command: string, args: string[], env: Record<string, string>) {
  const output = await new Deno.Command(command, {
    args,
    env,
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    code: output.code,
    stdout: new TextDecoder().decode(output.stdout),
    stderr: new TextDecoder().decode(output.stderr),
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}
