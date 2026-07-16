import { assert, assertEquals } from "../_assert.ts";
import { codexModelRouteArgsFromText } from "../../packages/analysis/codex_config.ts";

Deno.test("extracts only non-secret Codex model routing fields", () => {
  const args = codexModelRouteArgsFromText([
    'model_provider = "synthetic_provider"',
    'model = "synthetic-model"',
    "[model_providers.synthetic_provider]",
    'name = "Synthetic Provider"',
    'base_url = "https://synthetic.invalid/v1"',
    'wire_api = "responses"',
    "requires_openai_auth = true",
    "stream_max_retries = 3",
    'http_headers = { Authorization = "must-not-leak" }',
    'query_params = { token = "must-not-leak-either" }',
    "[mcp_servers.private_source]",
    'url = "https://private.invalid/mcp"',
  ].join("\n"));

  assertEquals(args, [
    "-c",
    'model="synthetic-model"',
    "-c",
    'model_provider="synthetic_provider"',
    "-c",
    'model_providers.synthetic_provider.name="Synthetic Provider"',
    "-c",
    'model_providers.synthetic_provider.base_url="https://synthetic.invalid/v1"',
    "-c",
    'model_providers.synthetic_provider.wire_api="responses"',
    "-c",
    "model_providers.synthetic_provider.requires_openai_auth=true",
    "-c",
    "model_providers.synthetic_provider.stream_max_retries=3",
  ]);
  assert(!args.join("\n").includes("must-not-leak"));
  assert(!args.join("\n").includes("mcp_servers"));
});

Deno.test("rejects unsafe or incomplete custom provider routing", () => {
  for (
    const config of [
      'model_provider = "missing"',
      'model_provider = "bad provider"\n[model_providers."bad provider"]\nbase_url = "https://example.invalid"',
      'model_provider = "custom"\n[model_providers.custom]\nbase_url = "file:///private/provider"',
      'model_provider = "custom"\n[model_providers.custom]\nbase_url = "https://user:secret@example.invalid/v1"',
      'model_provider = "custom"\n[model_providers.custom]\nbase_url = "https://example.invalid/v1?token=secret"',
    ]
  ) {
    let message = "";
    try {
      codexModelRouteArgsFromText(config);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    assert(message.includes("Codex model provider configuration is invalid"));
  }
});
