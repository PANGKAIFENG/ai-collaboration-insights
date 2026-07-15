import { assertEquals } from "../_assert.ts";
import { missingClosedReportDates } from "../../packages/core/time.ts";

Deno.test("returns only missing dates from the seven most recent closed windows", () => {
  const dates = missingClosedReportDates(
    new Date("2026-07-15T11:05:00.000Z"),
    "Asia/Shanghai",
    new Set(["2026-07-13"]),
  );
  assertEquals(dates, [
    "2026-07-09",
    "2026-07-10",
    "2026-07-11",
    "2026-07-12",
    "2026-07-14",
    "2026-07-15",
  ]);
});

Deno.test("returns dates in chronological generation order", () => {
  const dates = missingClosedReportDates(
    new Date("2026-07-15T10:55:00.000Z"),
    "Asia/Shanghai",
    new Set(),
    3,
  );
  assertEquals(dates, ["2026-07-12", "2026-07-13", "2026-07-14"]);
});
