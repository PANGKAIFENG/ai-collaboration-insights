import { parse } from "jsr:@std/toml@1.0.11";

type Table = Record<string, unknown>;

const INVALID_CONFIG = "Codex model provider configuration is invalid";
const PROVIDER_ID = /^[A-Za-z0-9_-]{1,100}$/;
const ENV_KEY = /^[A-Z_][A-Z0-9_]{0,127}$/;

function table(value: unknown): Table | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Table : undefined;
}

function string(value: unknown, maxLength: number): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength
    ? value
    : undefined;
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function configArg(args: string[], key: string, value: string | number | boolean): void {
  args.push("-c", `${key}=${typeof value === "string" ? tomlString(value) : value}`);
}

function providerKey(providerId: string, field: string): string {
  return `model_providers.${providerId}.${field}`;
}

export function codexModelRouteArgsFromText(content: string): string[] {
  let config: Table;
  try {
    config = table(parse(content)) ?? {};
  } catch {
    throw new Error(INVALID_CONFIG);
  }

  const args: string[] = [];
  if (config.model !== undefined) {
    const model = string(config.model, 200);
    if (!model) throw new Error(INVALID_CONFIG);
    configArg(args, "model", model);
  }

  if (config.model_provider === undefined) return args;
  const providerId = string(config.model_provider, 100);
  if (!providerId || !PROVIDER_ID.test(providerId)) throw new Error(INVALID_CONFIG);
  configArg(args, "model_provider", providerId);

  const provider = table(table(config.model_providers)?.[providerId]);
  if (!provider) {
    if (providerId === "openai") return args;
    throw new Error(INVALID_CONFIG);
  }

  const name = provider.name === undefined ? undefined : string(provider.name, 200);
  if (provider.name !== undefined && !name) throw new Error(INVALID_CONFIG);
  if (name) configArg(args, providerKey(providerId, "name"), name);

  const baseUrl = string(provider.base_url, 2_000);
  if (!baseUrl) throw new Error(INVALID_CONFIG);
  try {
    const parsed = new URL(baseUrl);
    if (
      !["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password ||
      parsed.search || parsed.hash
    ) throw new Error(INVALID_CONFIG);
  } catch {
    throw new Error(INVALID_CONFIG);
  }
  configArg(args, providerKey(providerId, "base_url"), baseUrl);

  if (provider.wire_api !== undefined) {
    const wireApi = string(provider.wire_api, 20);
    if (!wireApi || !["responses", "chat"].includes(wireApi)) throw new Error(INVALID_CONFIG);
    configArg(args, providerKey(providerId, "wire_api"), wireApi);
  }
  if (provider.requires_openai_auth !== undefined) {
    if (typeof provider.requires_openai_auth !== "boolean") throw new Error(INVALID_CONFIG);
    configArg(
      args,
      providerKey(providerId, "requires_openai_auth"),
      provider.requires_openai_auth,
    );
  }
  if (provider.env_key !== undefined) {
    const envKey = string(provider.env_key, 128);
    if (!envKey || !ENV_KEY.test(envKey)) throw new Error(INVALID_CONFIG);
    configArg(args, providerKey(providerId, "env_key"), envKey);
  }
  if (provider.supports_websockets !== undefined) {
    if (typeof provider.supports_websockets !== "boolean") throw new Error(INVALID_CONFIG);
    configArg(
      args,
      providerKey(providerId, "supports_websockets"),
      provider.supports_websockets,
    );
  }
  for (
    const field of ["request_max_retries", "stream_max_retries", "stream_idle_timeout_ms"] as const
  ) {
    if (provider[field] === undefined) continue;
    const value = provider[field];
    if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 600_000) {
      throw new Error(INVALID_CONFIG);
    }
    configArg(args, providerKey(providerId, field), Number(value));
  }
  return args;
}

function defaultConfigPath(): string | undefined {
  const codexHome = Deno.env.get("CODEX_HOME");
  if (codexHome) return `${codexHome}/config.toml`;
  const home = Deno.env.get("HOME");
  return home ? `${home}/.codex/config.toml` : undefined;
}

export async function codexModelRouteArgs(path = defaultConfigPath()): Promise<string[]> {
  if (!path) return [];
  try {
    return codexModelRouteArgsFromText(await Deno.readTextFile(path));
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return [];
    throw new Error(INVALID_CONFIG);
  }
}
