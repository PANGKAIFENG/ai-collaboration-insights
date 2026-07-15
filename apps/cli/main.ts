import { appPaths, codexSessionsRoot } from "../../packages/core/paths.ts";
import { localReportDate } from "../../packages/core/time.ts";
import { APP_VERSION } from "../../packages/core/types.ts";
import { generateDailyReport, generateScheduledReports } from "../../packages/report/pipeline.ts";
import {
  CONSENT_DISCLOSURE,
  grantConsent,
  readConsent,
  revokeConsent,
} from "../../packages/runtime/commands.ts";
import {
  installSchedule,
  purgeOwnedData,
  removeSchedule,
  scheduleStatus,
} from "../../packages/runtime/scheduler.ts";

export interface CliResult {
  code: number;
  stdout?: string;
  stderr?: string;
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`ACI_USAGE: ${name} requires a value`);
  return value;
}

export async function runCli(args: string[]): Promise<CliResult> {
  const [command] = args;
  if (command === "version") return { code: 0, stdout: APP_VERSION };
  if (command === "doctor") {
    const paths = appPaths();
    let codexSessions = "missing";
    try {
      const info = await Deno.stat(codexSessionsRoot());
      codexSessions = info.isDirectory ? "ready" : "invalid";
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) codexSessions = "unreadable";
    }
    let dataDirectory = "not_initialized";
    try {
      const ownership = JSON.parse(await Deno.readTextFile(`${paths.dataDir}/.aci-owned.json`));
      dataDirectory = ownership?.app === "ai-collaboration-insights" ? "ready" : "unowned";
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) dataDirectory = "unreadable";
    }
    const schedule = await scheduleStatus({ home: paths.home });
    return {
      code: codexSessions === "ready" ? 0 : 1,
      stdout: JSON.stringify({
        version: APP_VERSION,
        platform: `${Deno.build.os}-${Deno.build.arch}`,
        codexSessions,
        dataDirectory,
        schedule: schedule.status,
      }),
    };
  }
  if (command === "consent") {
    const paths = appPaths();
    const dataDir = option(args, "--data-dir") ?? paths.dataDir;
    const consentFile = `${dataDir}/consent.json`;
    const action = args[1];
    if (action === "grant") {
      const state = await grantConsent(consentFile);
      return { code: 0, stdout: JSON.stringify({ disclosure: CONSENT_DISCLOSURE, ...state }) };
    }
    if (action === "revoke") {
      return { code: 0, stdout: JSON.stringify(await revokeConsent(consentFile)) };
    }
    if (action === "status") {
      return { code: 0, stdout: JSON.stringify(await readConsent(consentFile)) };
    }
    return { code: 2, stderr: "ACI_USAGE: expected consent grant, revoke, or status" };
  }
  if (command === "report") {
    try {
      const defaults = appPaths();
      const timeZone = option(args, "--time-zone") ??
        Intl.DateTimeFormat().resolvedOptions().timeZone;
      const scheduled = args.includes("--scheduled");
      if (scheduled && option(args, "--date")) {
        throw new Error("ACI_USAGE: --scheduled cannot be combined with --date");
      }
      if (scheduled) {
        const results = await generateScheduledReports({
          timeZone,
          sourceRoot: option(args, "--source") ?? codexSessionsRoot(),
          dataDir: option(args, "--data-dir") ?? defaults.dataDir,
          noAi: args.includes("--no-ai"),
        });
        return {
          code: 0,
          stdout: JSON.stringify({
            status: "scheduled_complete",
            reports: results.map((result) => ({
              status: result.status,
              date: result.report.window.date,
              revision: result.report.revision,
            })),
          }),
        };
      }
      const date = option(args, "--date") ?? localReportDate(new Date(), timeZone);
      const result = await generateDailyReport({
        date,
        timeZone,
        sourceRoot: option(args, "--source") ?? codexSessionsRoot(),
        dataDir: option(args, "--data-dir") ?? defaults.dataDir,
        noAi: args.includes("--no-ai"),
        generationReason: "manual",
      });
      if (args.includes("--open")) {
        await new Deno.Command("/usr/bin/open", { args: [result.htmlPath] }).output();
      }
      return {
        code: 0,
        stdout: JSON.stringify({
          status: result.status,
          date: result.report.window.date,
          revision: result.report.revision,
          report: result.htmlPath,
        }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        code: message.startsWith("ACI_USAGE") ? 2 : 1,
        stderr: `ACI_REPORT_FAILED: ${message}`,
      };
    }
  }
  if (command === "schedule") {
    try {
      const paths = appPaths();
      const action = args[1];
      if (action === "install") {
        const result = await installSchedule({ home: paths.home, binaryPath: Deno.execPath() });
        return { code: 0, stdout: JSON.stringify(result) };
      }
      if (action === "remove") {
        return { code: 0, stdout: JSON.stringify(await removeSchedule({ home: paths.home })) };
      }
      if (action === "status") {
        return { code: 0, stdout: JSON.stringify(await scheduleStatus({ home: paths.home })) };
      }
      return { code: 2, stderr: "ACI_USAGE: expected schedule install, remove, or status" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { code: 1, stderr: `ACI_SCHEDULE_FAILED: ${message}` };
    }
  }
  if (command === "data") {
    if (args[1] !== "purge") {
      return { code: 2, stderr: "ACI_USAGE: expected data purge" };
    }
    try {
      const paths = appPaths();
      await purgeOwnedData({
        dataDir: paths.dataDir,
        home: paths.home,
        sourceRoot: codexSessionsRoot(),
      });
      return { code: 0, stdout: JSON.stringify({ status: "purged" }) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { code: 1, stderr: `ACI_PURGE_FAILED: ${message}` };
    }
  }
  return {
    code: 2,
    stderr: "ACI_USAGE: expected one of doctor, report, consent, schedule, data, version",
  };
}

if (import.meta.main) {
  const result = await runCli(Deno.args);
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  Deno.exit(result.code);
}
