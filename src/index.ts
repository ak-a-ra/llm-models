import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { buildModelIndex, findCatalogModel } from "./catalog.js";
import {
  findCatalogGeneratedProviders,
  positiveNumber,
  resolveApi,
  sanitizeConfig,
  sanitizeModelInput,
  validateModelsConfig,
} from "./config.js";
import type { CacheMeta, EndpointModel, ModelsDevModel, ModelsDevProvider, PiModelConfig, PiModelsConfig } from "./types.js";

const PI_AGENT_DIR = join(process.env.HOME || "", ".pi", "agent");
const MODELS_JSON_PATH = join(PI_AGENT_DIR, "models.json");
const CACHE_DIR = join(PI_AGENT_DIR, "llm-models-cache");
const CACHE_FILE = join(CACHE_DIR, "models-dev.json");
const CACHE_META_FILE = join(CACHE_DIR, "meta.json");
const MODELS_DEV_API = "https://models.dev/api.json?type=all";

async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

async function fetchModelsDevData(): Promise<Record<string, ModelsDevProvider>> {
  const response = await fetch(MODELS_DEV_API);
  if (!response.ok) {
    throw new Error(`models.dev returned ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<Record<string, ModelsDevProvider>>;
}

async function readCache(): Promise<Record<string, ModelsDevProvider> | null> {
  try {
    return JSON.parse(await fs.readFile(CACHE_FILE, "utf-8")) as Record<string, ModelsDevProvider>;
  } catch {
    return null;
  }
}

async function writeCache(data: Record<string, ModelsDevProvider>): Promise<CacheMeta> {
  await ensureCacheDir();
  await fs.writeFile(CACHE_FILE, JSON.stringify(data), "utf-8");
  const meta: CacheMeta = {
    fetchedAt: new Date().toISOString(),
    providerCount: Object.keys(data).length,
    modelCount: Object.values(data).reduce((sum, provider) => sum + Object.keys(provider.models || {}).length, 0),
  };
  await fs.writeFile(CACHE_META_FILE, JSON.stringify(meta, null, 2), "utf-8");
  return meta;
}

async function readCacheMeta(): Promise<CacheMeta | null> {
  try {
    return JSON.parse(await fs.readFile(CACHE_META_FILE, "utf-8")) as CacheMeta;
  } catch {
    return null;
  }
}

async function readModelsJson(): Promise<PiModelsConfig> {
  try {
    return JSON.parse(await fs.readFile(MODELS_JSON_PATH, "utf-8")) as PiModelsConfig;
  } catch {
    return { providers: {} };
  }
}

/** Sanitizes, validates, then writes models.json atomically. Never leaves an invalid file behind. */
async function writeModelsJson(config: PiModelsConfig): Promise<void> {
  const { config: clean, changed } = sanitizeConfig(config);
  const errors = validateModelsConfig(clean);
  if (errors.length > 0) {
    throw new Error(`Generated models.json is invalid:\n${errors.slice(0, 20).join("\n")}`);
  }

  await fs.mkdir(dirname(MODELS_JSON_PATH), { recursive: true });
  const tempPath = `${MODELS_JSON_PATH}.llm-models.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(clean, null, 2)}\n`, "utf-8");
  await fs.rename(tempPath, MODELS_JSON_PATH);
  if (changed > 0) {
    console.error(`[llm-models] sanitized ${changed} provider(s) while writing models.json`);
  }
}

function mapModelInput(model: ModelsDevModel | undefined, endpoint?: EndpointModel): Array<"text" | "image"> {
  const supportsImage = endpoint?.capabilities?.vision === true || model?.modalities?.input?.includes("image");
  return sanitizeModelInput(supportsImage ? ["text", "image"] : ["text"]);
}

function costFor(model: ModelsDevModel | undefined): PiModelConfig["cost"] {
  return {
    input: model?.cost?.input ?? 0,
    output: model?.cost?.output ?? 0,
    cacheRead: model?.cost?.cache_read ?? 0,
    cacheWrite: model?.cost?.cache_write ?? 0,
  };
}

function resolveApiKey(apiKey: string | undefined): string | undefined {
  if (!apiKey) return undefined;
  const match = /^\$([A-Z_][A-Z0-9_]*)$/.exec(apiKey);
  return match ? process.env[match[1]] : apiKey;
}

async function fetchEndpointModels(provider: { baseUrl?: string; apiKey?: string }): Promise<EndpointModel[]> {
  if (!provider.baseUrl) throw new Error("provider has no baseUrl");
  const base = provider.baseUrl.replace(/\/+$/, "");
  const endpoint = base.endsWith("/models") ? base : `${base}/models`;
  const headers: Record<string, string> = { Accept: "application/json" };
  const apiKey = resolveApiKey(provider.apiKey);
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(endpoint, { headers });
  if (!response.ok) {
    throw new Error(`endpoint returned ${response.status} ${response.statusText}`);
  }
  const payload = (await response.json()) as { data?: EndpointModel[] } | EndpointModel[];
  const models = Array.isArray(payload) ? payload : payload.data;
  if (!Array.isArray(models)) throw new Error("endpoint response has no model list");
  return models.filter((model) => typeof model.id === "string" && model.id.length > 0);
}

function modelFromEndpoint(endpointModel: EndpointModel, candidate?: { model: ModelsDevModel }): PiModelConfig {
  const catalogModel = candidate?.model;
  const endpointCapabilities = endpointModel.capabilities;
  const contextWindow = positiveNumber(
    catalogModel?.limit?.context,
    positiveNumber(endpointCapabilities?.contextWindow ?? endpointModel.context_length, 128000),
  );
  const maxTokens = positiveNumber(
    catalogModel?.limit?.output,
    positiveNumber(endpointCapabilities?.maxOutput ?? endpointModel.max_completion_tokens, 16384),
  );

  return {
    id: endpointModel.id,
    name: catalogModel?.name ?? endpointModel.id,
    reasoning: endpointCapabilities?.reasoning ?? catalogModel?.reasoning ?? false,
    input: mapModelInput(catalogModel, endpointModel),
    cost: costFor(catalogModel),
    contextWindow,
    maxTokens,
  };
}

async function updateCache(ctx: ExtensionCommandContext): Promise<void> {
  ctx.ui.notify("Fetching models.dev catalog...", "info");
  try {
    const catalog = await fetchModelsDevData();
    const meta = await writeCache(catalog);
    ctx.ui.notify(
      `Cached ${meta.providerCount} providers and ${meta.modelCount} models. Run /llm-models fetch to apply them to a Pi endpoint.`,
      "info",
    );
  } catch (error) {
    ctx.ui.notify(`Update failed: ${error instanceof Error ? error.message : String(error)}`, "error");
  }
}

/**
 * Repairs models.json in place: removes catalog-generated provider blocks and
 * sanitizes every remaining provider so Pi can load the file.
 */
async function repairConfig(ctx: ExtensionCommandContext): Promise<void> {
  const config = await readModelsJson();
  const catalog = (await readCache()) || {};
  const generated = findCatalogGeneratedProviders(config, catalog);

  for (const providerId of generated) {
    delete config.providers[providerId];
  }

  const { changed } = sanitizeConfig(config);
  try {
    await writeModelsJson(config);
  } catch (error) {
    ctx.ui.notify(`Repair failed: ${error instanceof Error ? error.message : String(error)}`, "error");
    return;
  }

  const remaining = Object.keys(config.providers).length;
  ctx.ui.notify(
    `Repaired models.json: removed ${generated.length} catalog-generated provider(s), sanitized ${changed} provider(s). ${remaining} provider(s) remain. Run /reload to activate them.`,
    "info",
  );
}

function endpointProviders(config: PiModelsConfig): string[] {
  return Object.entries(config.providers)
    .filter(([, provider]) => Boolean(provider.baseUrl && provider.api))
    .map(([providerId]) => providerId);
}

async function fetchAndApply(ctx: ExtensionCommandContext, requestedProvider?: string): Promise<void> {
  const catalog = await readCache();
  if (!catalog) {
    ctx.ui.notify("No models.dev cache found. Run /llm-models update first.", "warning");
    return;
  }

  const config = await readModelsJson();

  // Always start from a clean file so legacy catalog-generated blocks cannot survive.
  const generated = findCatalogGeneratedProviders(config, catalog);
  for (const providerId of generated) {
    delete config.providers[providerId];
  }

  const providerIds = requestedProvider ? [requestedProvider] : endpointProviders(config);
  if (providerIds.length === 0) {
    ctx.ui.notify("No endpoint provider found. Set baseUrl and api in models.json first.", "warning");
    return;
  }
  if (requestedProvider && !config.providers[requestedProvider]) {
    ctx.ui.notify(`Provider not found: ${requestedProvider}`, "error");
    return;
  }

  const index = buildModelIndex(catalog);
  let totalModels = 0;
  let matchedModels = 0;

  for (const providerId of providerIds) {
    const provider = config.providers[providerId];
    try {
      ctx.ui.notify(`Fetching models from ${providerId}...`, "info");
      const endpointModels = await fetchEndpointModels(provider);
      const models = endpointModels.map((endpointModel) => {
        const candidate = findCatalogModel(index, endpointModel.id);
        if (candidate) matchedModels++;
        return modelFromEndpoint(endpointModel, candidate);
      });
      provider.models = models;
      provider.api = resolveApi(provider.api);
      totalModels += models.length;
    } catch (error) {
      ctx.ui.notify(`${providerId} failed: ${error instanceof Error ? error.message : String(error)}`, "error");
      return;
    }
  }

  try {
    await writeModelsJson(config);
    ctx.ui.notify(
      `Applied ${totalModels} endpoint models (${matchedModels} matched with models.dev) to ${providerIds.join(", ")}. Run /reload to activate them.`,
      "info",
    );
  } catch (error) {
    ctx.ui.notify(`Config was not changed: ${error instanceof Error ? error.message : String(error)}`, "error");
  }
}

async function showInfo(ctx: ExtensionCommandContext): Promise<void> {
  const meta = await readCacheMeta();
  if (!meta) {
    ctx.ui.notify("No models.dev cache found. Run /llm-models update first.", "warning");
    return;
  }
  ctx.ui.notify(
    `models.dev cache\nFetched: ${meta.fetchedAt}\nProviders: ${meta.providerCount}\nModels: ${meta.modelCount}`,
    "info",
  );
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("llm-models", {
    description: "Update Pi endpoint models using models.dev metadata",
    handler: async (args, ctx) => {
      const [subcommand, providerId] = args.trim().split(/\s+/).filter(Boolean);
      switch (subcommand) {
        case "update":
          await updateCache(ctx);
          break;
        case "fetch":
          await fetchAndApply(ctx, providerId);
          break;
        case "repair":
          await repairConfig(ctx);
          break;
        case "info":
          await showInfo(ctx);
          break;
        case "help":
        default:
          ctx.ui.notify(
            "Usage: /llm-models <command> [provider]\n  update          - Download models.dev metadata to the local cache\n  fetch [provider] - Fetch /models from a configured Pi endpoint and apply models.dev metadata\n  repair          - Remove stale catalog-generated providers and sanitize models.json\n  info            - Show cache details\n  help            - Show this help",
            "info",
          );
      }
    },
  });
}
