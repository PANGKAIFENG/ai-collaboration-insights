import { appPaths, codexSessionsRoot } from "../../packages/core/paths.ts";
import { localReportDate } from "../../packages/core/time.ts";
import { APP_VERSION } from "../../packages/core/types.ts";
import { generateDailyReport } from "../../packages/report/pipeline.ts";
import {
  CONSENT_DISCLOSURE,
  grantConsent,
  readConsent,
  revokeConsent,
} from "../../packages/runtime/commands.ts";

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
