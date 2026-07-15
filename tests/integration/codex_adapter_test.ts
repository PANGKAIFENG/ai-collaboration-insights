import { assert, assertEquals } from "../_assert.ts";
import { scanCodexWindow } from "../../packages/codex/adapter.ts";
import { reportDateWindow } from "../../packages/core/time.ts";

const fixtureRoot = new URL("../fixtures/codex", import.meta.url).pathname;

Deno.test("scans a left-closed right-open window with stable deduplication", async () => {
  const window = reportDateWindow("2026-07-15", "Asia/Shanghai");
  const first = await scanCodexWindow({ root: fixtureRoot, window });
  const second = await scanCodexWindow({ root: fixtureRoot, window });
  assertEquals(first.events.length, 6);
  assertEquals(
    first.events.map((event) => event.eventId),
    second.events.map((event) => event.eventId),
  );
  assertEquals(first.fingerprint, second.fingerprint);
  assertEquals(first.diagnostics.unknownEvents, 1);
  assert(first.events.every((event) => event.timestamp < window.end));
  assert(first.events.some((event) => event.timestamp === window.start));
});

Deno.test("leaves source bytes mtime and mode unchanged", async () => {
  const file = `${fixtureRoot}/window-basic.jsonl`;
  const beforeBytes = await Deno.readFile(file);
  const before = await Deno.stat(file);
  await scanCodexWindow({
    root: fixtureRoot,
    window: reportDateWindow("2026-07-15", "Asia/Shanghai"),
  });
  const afterBytes = await Deno.readFile(file);
  const after = await Deno.stat(file);
  assertEquals(Array.from(afterBytes), Array.from(beforeBytes));
  assertEquals(after.mtime?.toISOString(), before.mtime?.toISOString());
  assertEquals(after.mode, before.mode);
});

Deno.test("skips oversized lines and reports partial completeness", async () => {
  const root = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(`${root}/oversized.jsonl`, `${"x".repeat(256)}\n`);
    const result = await scanCodexWindow({
      root,
      window: reportDateWindow("2026-07-15", "Asia/Shanghai"),
      limits: { maxLineBytes: 128, maxEvents: 100, maxPreviewChars: 100 },
    });
    assertEquals(result.diagnostics.skippedLines, 1);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
