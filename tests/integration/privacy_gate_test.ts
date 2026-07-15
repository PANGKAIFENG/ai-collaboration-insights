import { assert, assertEquals } from "../_assert.ts";

const repository = new URL("../..", import.meta.url).pathname;

Deno.test("privacy gate accepts the tracked repository and synthetic fixtures", async () => {
  const result = await runPrivacyGate([]);
  assertEquals(result.code, 0);
});

Deno.test("privacy gate rejects private content and generated local artifacts", async () => {
  const cases: Array<{ path: string; content: string }> = [
    { path: "private-path.txt", content: `/Users/${"alice"}/work/private-project` },
    { path: "secret.txt", content: `sk-${"A".repeat(32)}` },
    {
      path: "session.jsonl",
      content: JSON.stringify({
        type: "session_meta",
        payload: { id: crypto.randomUUID(), cwd: "/tmp/project" },
      }),
    },
    { path: "state.sqlite", content: "" },
    { path: "reports/2026-07-15/report.json", content: "{}" },
  ];
  for (const testCase of cases) {
    const root = await Deno.makeTempDir();
    try {
      const file = `${root}/${testCase.path}`;
      await Deno.mkdir(file.slice(0, file.lastIndexOf("/")), { recursive: true });
      await Deno.writeTextFile(file, testCase.content);
      const result = await runPrivacyGate([root]);
      assert(result.code !== 0, `expected privacy gate to reject ${testCase.path}`);
      if (testCase.content) {
        assert(!result.stdout.includes(testCase.content), "privacy output must not echo content");
      }
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  }
});

Deno.test("privacy gate accepts ordinary synthetic source text", async () => {
  const root = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(`${root}/safe.txt`, "Synthetic report parser contract\n");
    const result = await runPrivacyGate([root]);
    assertEquals(result.code, 0);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("privacy gate does not require optional PCRE2 support", async () => {
  const root = await Deno.makeTempDir();
  const bin = await Deno.makeTempDir();
  try {
    const realRg = new TextDecoder().decode(
      (await new Deno.Command("which", {
        args: ["rg"],
        stdout: "piped",
      }).output()).stdout,
    ).trim();
    const shim = `${bin}/rg`;
    await Deno.writeTextFile(
      shim,
      `#!/bin/sh
for arg in "$@"; do
  [ "$arg" = "--pcre2" ] && exit 2
done
exec "$REAL_RG" "$@"
`,
      { mode: 0o755 },
    );

    for (
      const [name, content] of [
        ["private.txt", `/Users/${"alice"}/private-project`],
        ["secret.txt", `sk-${"B".repeat(32)}`],
      ]
    ) {
      await Deno.writeTextFile(`${root}/${name}`, content);
      const result = await runPrivacyGate([`${root}/${name}`], {
        PATH: `${bin}:${Deno.env.get("PATH") ?? ""}`,
        REAL_RG: realRg,
      });
      assert(result.code !== 0, `expected privacy gate to reject ${name}`);
    }
  } finally {
    await Deno.remove(root, { recursive: true });
    await Deno.remove(bin, { recursive: true });
  }
});

async function runPrivacyGate(paths: string[], env?: Record<string, string>) {
  const output = await new Deno.Command("sh", {
    args: ["scripts/privacy_check.sh", ...paths],
    cwd: repository,
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
