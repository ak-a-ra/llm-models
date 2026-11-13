// Self-check: validates ~/.pi/agent/models.json against Pi's models.json schema rules.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Compile } from "typebox/compile";
import { Type } from "typebox";

const ModelCostSchema = Type.Object({
  input: Type.Number(),
  output: Type.Number(),
  cacheRead: Type.Number(),
  cacheWrite: Type.Number(),
  tiers: Type.Optional(
    Type.Array(
      Type.Object({
        inputTokensAbove: Type.Number(),
        input: Type.Number(),
        output: Type.Number(),
        cacheRead: Type.Number(),
        cacheWrite: Type.Number(),
      }),
    ),
  ),
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
const path = join(process.env.HOME, ".pi", "agent", "models.json");
const parsed = JSON.parse(await readFile(path, "utf-8"));

if (!validate.Check(parsed)) {
  console.error("models.json FAILED schema validation:");
  for (const error of validate.Errors(parsed).slice(0, 20)) {
    console.error(`  - ${error.instancePath}: ${error.message}`);
  }
  process.exit(1);
}

const providerCount = Object.keys(parsed.providers).length;
const modelCount = Object.values(parsed.providers).reduce((sum, p) => sum + (p.models?.length ?? 0), 0);
console.log(`models.json OK: ${providerCount} providers, ${modelCount} models`);
