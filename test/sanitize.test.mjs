// Regression tests for the models.json schema bug.
//
// Old versions of this plugin wrote models.dev catalog providers directly into
// models.json. That produced:
//   - providers.<id>.baseUrl = "" (schema: minLength 1)
//   - models[].input containing "video" / "audio" / "pdf" (schema: text | image only)
//   - unsupported api ids such as "cohere-chat"
//
// These tests feed that broken shape through the plugin's sanitizer and assert
// the result passes Pi's models.json schema.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Compile } from "typebox/compile";
import { Type } from "typebox";
import { findCatalogGeneratedProviders, sanitizeConfig, validateModelsConfig } from "../dist/config.js";

const ModelCostSchema = Type.Object({
  input: Type.Number(),
  output: Type.Number(),
  cacheRead: Type.Number(),
  cacheWrite: Type.Number(),
});

const ModelInputModalitySchema = Type.Union([Type.Literal("text"), Type.Literal("image")]);

const ModelDefinitionSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  name: Type.Optional(Type.String({ minLength: 1 })),
  api: Type.Optional(Type.String({ minLength: 1 })),
  baseUrl: Type.Optional(Type.String({ minLength: 1 })),
  reasoning: Type.Optional(Type.Boolean()),
  input: Type.Optional(Type.Array(ModelInputModalitySchema)),
  cost: Type.Optional(ModelCostSchema),
  contextWindow: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
  maxTokens: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
});

const ProviderConfigSchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1 })),
  baseUrl: Type.Optional(Type.String({ minLength: 1 })),
  apiKey: Type.Optional(Type.String({ minLength: 1 })),
  api: Type.Optional(Type.String({ minLength: 1 })),
  models: Type.Optional(Type.Array(ModelDefinitionSchema)),
});

const ModelsConfigSchema = Type.Object({
  $schema: Type.Optional(Type.String()),
  providers: Type.Record(Type.String(), ProviderConfigSchema),
});

const validate = Compile(ModelsConfigSchema);

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${message}`);
  }
}

// Shape produced by the buggy v1.0.0 plugin.
const brokenConfig = {
  providers: {
    "salad-cloud": {
      baseUrl: "",
      apiKey: "$SALAD_CLOUD_API_KEY",
      api: "openai-completions",
      models: [
        {
          id: "llama-3.3-70b",
          name: "Llama 3.3 70B",
          reasoning: true,
          input: ["text", "image", "video", "audio"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128000,
          maxTokens: 64000,
        },
      ],
    },
    "alibaba-cn": {
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "$DASHSCOPE_API_KEY",
      api: "openai-completions",
      models: [
        {
          id: "qwen3-max",
          name: "Qwen3 Max",
          reasoning: true,
          input: ["text", "image", "video"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 1000000,
          maxTokens: 131072,
        },
      ],
    },
    cohere: {
      baseUrl: "",
      apiKey: "$COHERE_API_KEY",
      api: "cohere-chat",
      models: [
        {
          id: "command-a",
          name: "Command A",
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 256000,
          maxTokens: 64000,
        },
      ],
    },
    "9router": {
      baseUrl: "http://127.0.0.1:20128/v1",
      apiKey: "sk-test",
      api: "openai-completions",
      models: [
        {
          id: "cbai/glm-5.2",
          name: "GLM-5.2",
          reasoning: true,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 1000000,
          maxTokens: 131072,
        },
      ],
    },
  },
};

const catalog = {
  "salad-cloud": { id: "salad-cloud", env: ["SALAD_CLOUD_API_KEY"], api: undefined, models: { "llama-3.3-70b": { id: "llama-3.3-70b", name: "Llama 3.3 70B" } } },
  "alibaba-cn": { id: "alibaba-cn", env: ["DASHSCOPE_API_KEY"], api: "https://dashscope.aliyuncs.com/compatible-mode/v1", models: { "qwen3-max": { id: "qwen3-max", name: "Qwen3 Max" } } },
  cohere: { id: "cohere", env: ["COHERE_API_KEY"], api: undefined, models: { "command-a": { id: "command-a", name: "Command A" } } },
};

// 1. The broken config fails Pi's schema before sanitizing.
assert(!validate.Check(brokenConfig), "broken config fails Pi's models.json schema");

// 2. Sanitizing removes the schema violations.
const { config: clean, changed } = sanitizeConfig(brokenConfig);
assert(changed > 0, `sanitizer reported ${changed} changed provider(s)`);
assert(validate.Check(clean), "sanitized config passes Pi's models.json schema");
assert(validateModelsConfig(clean).length === 0, "sanitized config passes the plugin's own validation");

// 3. Specific fixes.
assert(clean.providers["salad-cloud"].baseUrl === undefined, "empty baseUrl is removed");
assert(clean.providers.cohere.baseUrl === undefined, "empty cohere baseUrl is removed");
assert(clean.providers.cohere.api === "openai-completions", "cohere-chat api is mapped to a supported api");
assert(
  clean.providers["alibaba-cn"].models[0].input.every((item) => item === "text" || item === "image"),
  "input modalities are limited to text/image",
);
assert(
  clean.providers["salad-cloud"].models[0].input.every((item) => item === "text" || item === "image"),
  "video/audio modalities are stripped",
);

// 4. Catalog-generated providers are detected so they can be removed.
const generated = findCatalogGeneratedProviders(brokenConfig, catalog);
assert(
  generated.includes("salad-cloud") && generated.includes("alibaba-cn") && generated.includes("cohere"),
  `catalog-generated providers detected: ${generated.join(", ")}`,
);
assert(!generated.includes("9router"), "user endpoint provider is not treated as catalog-generated");

// 5. The live file on this machine is valid.
const livePath = join(process.env.HOME, ".pi", "agent", "models.json");
const live = JSON.parse(await readFile(livePath, "utf-8"));
assert(validate.Check(live), "live ~/.pi/agent/models.json passes Pi's models.json schema");
assert(validateModelsConfig(live).length === 0, "live ~/.pi/agent/models.json passes the plugin's own validation");

if (process.exitCode) {
  console.error("\nSome checks failed.");
} else {
  console.log("\nAll checks passed.");
}
