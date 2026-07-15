import { APP_VERSION } from "../../packages/core/types.ts";

export interface CliResult {
  code: number;
  stdout?: string;
  stderr?: string;
}

export function runCli(args: string[]): CliResult {
  const [command] = args;
  if (command === "version") return { code: 0, stdout: APP_VERSION };
  return {
    code: 2,
    stderr: "ACI_USAGE: expected one of doctor, report, consent, schedule, data, version",
  };
}

if (import.meta.main) {
  const result = runCli(Deno.args);
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  Deno.exit(result.code);
}
