import { assert, assertEquals } from "../_assert.ts";
import { resolveContainedFile } from "../../packages/core/paths.ts";

Deno.test("accepts a regular file inside the source root", async () => {
  const root = await Deno.makeTempDir();
  try {
    const file = `${root}/session.jsonl`;
    await Deno.writeTextFile(file, "{}\n");
    assertEquals(await resolveContainedFile(root, file, ".jsonl"), await Deno.realPath(file));
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("rejects a symlink that escapes the source root", async () => {
  const root = await Deno.makeTempDir();
  const outside = await Deno.makeTempFile({ suffix: ".jsonl" });
  try {
    const link = `${root}/escape.jsonl`;
    await Deno.symlink(outside, link);
    let rejected = false;
    try {
      await resolveContainedFile(root, link, ".jsonl");
    } catch (error) {
      rejected = error instanceof Error && error.message.includes("outside source root");
    }
    assert(rejected, "expected symlink escape to be rejected");
  } finally {
    await Deno.remove(root, { recursive: true });
    await Deno.remove(outside);
  }
});
