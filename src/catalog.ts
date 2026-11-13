import type { ModelsDevModel, ModelsDevProvider, ModelCandidate, ModelIndex } from "./types.js";

export const CANONICAL_PROVIDER_ALIASES: Record<string, string> = {
  alibaba: "alibaba",
  amazon: "amazon-bedrock",
  anthropic: "anthropic",
  cohere: "cohere",
  deepseek: "deepseek",
  google: "google",
  inclusionai: "inclusionai",
  meta: "meta",
  microsoft: "microsoft",
  minimax: "minimax",
  mistralai: "mistral",
  moonshotai: "moonshotai",
  nvidia: "nvidia",
  openai: "openai",
  qwen: "alibaba",
  upstage: "upstage",
  xai: "xai",
  zhipuai: "zai",
};

export function buildModelIndex(catalog: Record<string, ModelsDevProvider>): ModelIndex {
  const byModelId = new Map<string, ModelCandidate[]>();
  const byCanonicalId = new Map<string, ModelCandidate[]>();

  const add = (map: Map<string, ModelCandidate[]>, key: string, candidate: ModelCandidate) => {
    const values = map.get(key) || [];
    values.push(candidate);
    map.set(key, values);
  };

  for (const [providerId, provider] of Object.entries(catalog)) {
    for (const model of Object.values(provider.models || {})) {
      const candidate = { providerId, model };
      add(byModelId, model.id, candidate);
      if (model.canonical_model_id) add(byCanonicalId, model.canonical_model_id, candidate);
    }
  }
  return { byModelId, byCanonicalId };
}

function canonicalProvider(model: ModelsDevModel): string | undefined {
  const namespace = model.canonical_model_id?.split("/")[0];
  return namespace ? CANONICAL_PROVIDER_ALIASES[namespace] : undefined;
}

function chooseCandidate(candidates: ModelCandidate[] | undefined): ModelCandidate | undefined {
  if (!candidates?.length) return undefined;
  for (const candidate of candidates) {
    const preferred = canonicalProvider(candidate.model);
    if (preferred && candidate.providerId === preferred) return candidate;
  }
  return candidates[0];
}

function stripRouteSuffix(id: string): string {
  return id.replace(/-(?:high|medium|low|xhigh|max)$/i, "");
}

export function findCatalogModel(index: ModelIndex, endpointId: string): ModelCandidate | undefined {
  const keys = [
    endpointId,
    endpointId.replace(/^[^/]+\//, ""),
    stripRouteSuffix(endpointId),
    stripRouteSuffix(endpointId.replace(/^[^/]+\//, "")),
  ];

  for (const key of keys) {
    const canonical = chooseCandidate(index.byCanonicalId.get(key));
    if (canonical) return canonical;
    const direct = chooseCandidate(index.byModelId.get(key));
    if (direct) return direct;
  }

  const stripped = stripRouteSuffix(endpointId.replace(/^[^/]+\//, ""));
  const lastSlash = stripped.lastIndexOf("/");
  const tail = lastSlash >= 0 ? stripped.slice(lastSlash + 1) : stripped;
  return chooseCandidate(index.byModelId.get(tail)) || chooseCandidate(index.byCanonicalId.get(tail));
}
