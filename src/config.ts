import type { PiModelsConfig, PiProviderConfig, PiModelConfig } from "./types.js";
import type { ModelsDevProvider } from "./types.js";

export const SUPPORTED_APIS = new Set([
  "openai-completions",
  "openai-responses",
  "openai-codex-responses",
  "azure-openai-responses",
  "anthropic-messages",
  "mistral-conversations",
  "bedrock-converse-stream",
  "google-generative-ai",
  "google-vertex",
  "pi-messages",
]);

/** models.dev / AI SDK provider names that Pi does not implement natively. */
export const API_ALIASES: Record<string, string> = {
  "cohere-chat": "openai-completions",
  "bedrock-converse": "bedrock-converse-stream",
  "google-vertex-anthropic": "google-vertex",
  "openai-decisions": "openai-responses",
  "vercel-ai-gateway": "openai-completions",
  "typesafe-system-one": "openai-completions",
  "cloudflare-workers-ai-system-one": "openai-completions",
};

export function resolveApi(api: string | undefined): string | undefined {
  if (!api) return undefined;
  if (SUPPORTED_APIS.has(api)) return api;
  return API_ALIASES[api] ?? api;
}

export function positiveNumber(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Pi's models.json schema only allows "text" and "image" input modalities. */
export function sanitizeModelInput(input: unknown): Array<"text" | "image"> {
  if (!Array.isArray(input)) return ["text"];
  const result: Array<"text" | "image"> = [];
  for (const item of input) {
    if (item === "text" && !result.includes("text")) result.push("text");
    if (item === "image" && !result.includes("image")) result.push("image");
  }
  return result.length > 0 ? result : ["text"];
}

export function sanitizeModel(model: PiModelConfig): PiModelConfig | null {
  if (!model || typeof model.id !== "string" || model.id.length === 0) return null;

  const sanitized: PiModelConfig = { ...model, id: model.id };

  if (typeof sanitized.name !== "string" || sanitized.name.length === 0) {
    delete sanitized.name;
  }
  if (typeof sanitized.api !== "string" || sanitized.api.length === 0) {
    delete sanitized.api;
  }
  if (typeof sanitized.baseUrl !== "string" || sanitized.baseUrl.length === 0) {
    delete sanitized.baseUrl;
  }
  if (typeof sanitized.reasoning !== "boolean") {
    delete sanitized.reasoning;
  }

  if (sanitized.input !== undefined) {
    sanitized.input = sanitizeModelInput(sanitized.input);
  }

  if (sanitized.contextWindow !== undefined) {
    sanitized.contextWindow = positiveNumber(sanitized.contextWindow, 128000);
  }
  if (sanitized.maxTokens !== undefined) {
    sanitized.maxTokens = positiveNumber(sanitized.maxTokens, 16384);
  }

  if (sanitized.cost !== undefined) {
    const cost = sanitized.cost as Record<string, unknown>;
    sanitized.cost = {
      input: finiteNumber(cost.input),
      output: finiteNumber(cost.output),
      cacheRead: finiteNumber(cost.cacheRead),
      cacheWrite: finiteNumber(cost.cacheWrite),
    };
  }

  return sanitized;
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function sanitizeProvider(provider: PiProviderConfig): PiProviderConfig | null {
  if (!provider || typeof provider !== "object") return null;

  const sanitized: PiProviderConfig = { ...provider };

  if (typeof sanitized.name !== "string" || sanitized.name.length === 0) {
    delete sanitized.name;
  }
  if (typeof sanitized.baseUrl !== "string" || sanitized.baseUrl.length === 0) {
    delete sanitized.baseUrl;
  }
  if (typeof sanitized.apiKey !== "string" || sanitized.apiKey.length === 0) {
    delete sanitized.apiKey;
  }
  if (typeof sanitized.api !== "string" || sanitized.api.length === 0) {
    delete sanitized.api;
  } else {
    sanitized.api = resolveApi(sanitized.api);
  }

  if (Array.isArray(sanitized.models)) {
    const models = sanitized.models
      .map((model) => sanitizeModel(model))
      .filter((model): model is PiModelConfig => model !== null);
    sanitized.models = models;
  }

  return sanitized;
}

/**
 * Removes every schema violation from a whole models.json document.
 * This repairs files written by older versions of this plugin.
 */
export function sanitizeConfig(config: PiModelsConfig): { config: PiModelsConfig; changed: number } {
  const providers: Record<string, PiProviderConfig> = {};
  let changed = 0;

  for (const [providerId, provider] of Object.entries(config.providers || {})) {
    const sanitized = sanitizeProvider(provider);
    if (!sanitized) {
      changed++;
      continue;
    }
    if (JSON.stringify(sanitized) !== JSON.stringify(provider)) changed++;
    providers[providerId] = sanitized;
  }

  return { config: { ...config, providers }, changed };
}

export function validateModelsConfig(config: PiModelsConfig): string[] {
  const errors: string[] = [];
  if (!config.providers || typeof config.providers !== "object") {
    return ["providers must be an object"];
  }

  for (const [providerId, provider] of Object.entries(config.providers)) {
    if (!provider || typeof provider !== "object") {
      errors.push(`providers.${providerId} must be an object`);
      continue;
    }
    if (provider.baseUrl !== undefined && (typeof provider.baseUrl !== "string" || provider.baseUrl.length === 0)) {
      errors.push(`providers.${providerId}.baseUrl must be a non-empty string`);
    }
    if (provider.apiKey !== undefined && (typeof provider.apiKey !== "string" || provider.apiKey.length === 0)) {
      errors.push(`providers.${providerId}.apiKey must be a non-empty string`);
    }
    if (provider.api !== undefined && (typeof provider.api !== "string" || provider.api.length === 0)) {
      errors.push(`providers.${providerId}.api must be a non-empty string`);
    }
    for (const [index, model] of (provider.models || []).entries()) {
      const path = `providers.${providerId}.models.${index}`;
      if (!model.id || typeof model.id !== "string") errors.push(`${path}.id must be a non-empty string`);
      if (model.input && !model.input.every((item) => item === "text" || item === "image")) {
        errors.push(`${path}.input contains an unsupported modality`);
      }
      if (model.contextWindow !== undefined && positiveNumber(model.contextWindow, 0) === 0) {
        errors.push(`${path}.contextWindow must be greater than zero`);
      }
      if (model.maxTokens !== undefined && positiveNumber(model.maxTokens, 0) === 0) {
        errors.push(`${path}.maxTokens must be greater than zero`);
      }
      if (model.cost) {
        for (const key of ["input", "output", "cacheRead", "cacheWrite"] as const) {
          if (typeof model.cost[key] !== "number" || !Number.isFinite(model.cost[key])) {
            errors.push(`${path}.cost.${key} must be a finite number`);
          }
        }
      }
    }
  }
  return errors;
}

/**
 * Detects provider blocks that older versions of this plugin generated from the
 * models.dev catalog instead of from a user endpoint.
 */
export function findCatalogGeneratedProviders(
  config: PiModelsConfig,
  catalog: Record<string, ModelsDevProvider>,
): string[] {
  const generated: string[] = [];

  for (const [providerId, provider] of Object.entries(config.providers || {})) {
    const source = catalog[providerId];
    if (!source) continue;

    const expectedKey = source.env?.[0] ? `$${source.env[0]}` : undefined;
    const keyMatches = provider.apiKey === expectedKey;
    const urlMatches = source.api ? provider.baseUrl === source.api : !provider.baseUrl;
    const catalogModelIds = new Set(Object.keys(source.models || {}));
    const modelIds = (provider.models || []).map((model) => model.id);
    const modelsMatch = modelIds.length > 0 && modelIds.every((id) => catalogModelIds.has(id));

    if (keyMatches && urlMatches && modelsMatch) {
      generated.push(providerId);
    }
  }

  return generated;
}
