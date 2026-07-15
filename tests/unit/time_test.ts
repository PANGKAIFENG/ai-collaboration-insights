import { assertEquals, assertRejects } from "../_assert.ts";
import { reportDateWindow } from "../../packages/core/time.ts";

Deno.test("builds the Asia/Shanghai 19:00 daily window", () => {
  const window = reportDateWindow("2026-07-15", "Asia/Shanghai");
  assertEquals(window, {
    date: "2026-07-15",
    start: "2026-07-14T11:00:00.000Z",
    end: "2026-07-15T11:00:00.000Z",
    timeZone: "Asia/Shanghai",
  });
});

Deno.test("rejects impossible report dates", async () => {
  await assertRejects(
    () => Promise.resolve(reportDateWindow("2026-02-30", "Asia/Shanghai")),
    /invalid report date/,
  );
});
