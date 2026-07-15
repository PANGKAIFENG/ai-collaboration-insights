import type { ReportWindow } from "./types.ts";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(value: string): [number, number, number] {
  const match = DATE_PATTERN.exec(value);
  if (!match) throw new Error(`invalid report date: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) throw new Error(`invalid report date: ${value}`);
  return [year, month, day];
}

function formatDate(year: number, month: number, day: number): string {
  const yyyy = String(year).padStart(4, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function shiftDate(value: string, days: number): string {
  const [year, month, day] = parseDate(value);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return formatDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

function timeZoneOffsetMs(at: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const values: Record<string, number> = {};
  for (const part of formatter.formatToParts(at)) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second,
  ) - at.getTime();
}

function zonedTimeToUtc(date: string, hour: number, timeZone: string): Date {
  const [year, month, day] = parseDate(date);
  const localEpoch = Date.UTC(year, month - 1, day, hour);
  let instant = new Date(localEpoch);
  for (let attempt = 0; attempt < 3; attempt++) {
    instant = new Date(localEpoch - timeZoneOffsetMs(instant, timeZone));
  }
  return instant;
}

export function reportDateWindow(date: string, timeZone: string): ReportWindow {
  parseDate(date);
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(new Date());
  } catch {
    throw new Error(`invalid time zone: ${timeZone}`);
  }
  return {
    date,
    start: zonedTimeToUtc(shiftDate(date, -1), 19, timeZone).toISOString(),
    end: zonedTimeToUtc(date, 19, timeZone).toISOString(),
    timeZone,
  };
}

export function localReportDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const currentDate = `${value.year}-${value.month}-${value.day}`;
  return Number(value.hour) >= 19 ? currentDate : shiftDate(currentDate, -1);
}

export function previousReportDate(date: string): string {
  return shiftDate(date, -1);
}

export function missingClosedReportDates(
  now: Date,
  timeZone: string,
  generatedDates: ReadonlySet<string>,
  limit = 7,
): string[] {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("limit must be a positive integer");
  const latest = localReportDate(now, timeZone);
  const dates: string[] = [];
  for (let offset = limit - 1; offset >= 0; offset--) {
    const date = shiftDate(latest, -offset);
    if (!generatedDates.has(date)) dates.push(date);
  }
  return dates;
}
