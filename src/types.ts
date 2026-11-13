export interface ModelsDevModel {
  id: string;
  name: string;
  description?: string;
  attachment?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  structured_output?: boolean;
  temperature?: boolean;
  modalities?: { input?: string[]; output?: string[] };
  limit?: { context?: number; output?: number };
  cost?: {
    input?: number;
    output?: number;
    cache_read?: number;
    cache_write?: number;
  };
  canonical_model_id?: string;
}

export interface ModelsDevProvider {
  id: string;
  name: string;
  api?: string;
  env?: string[];
  npm?: string;
  doc?: string;
  models?: Record<string, ModelsDevModel>;
}

export interface EndpointModel {
  id: string;
  object?: string;
  owned_by?: string;
  context_length?: number;
  max_completion_tokens?: number;
  capabilities?: {
    vision?: boolean;
    pdf?: boolean;
    audioInput?: boolean;
    videoInput?: boolean;
    imageOutput?: boolean;
    audioOutput?: boolean;
    search?: boolean;
    tools?: boolean;
    reasoning?: boolean;
    contextWindow?: number;
    maxOutput?: number;
  };
}

export interface PiModelConfig {
  id: string;
  name?: string;
  reasoning?: boolean;
  input?: Array<"text" | "image">;
  cost?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow?: number;
  maxTokens?: number;
  [key: string]: unknown;
}

export interface PiProviderConfig {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  api?: string;
  models?: PiModelConfig[];
  modelOverrides?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PiModelsConfig {
  providers: Record<string, PiProviderConfig>;
  [key: string]: unknown;
}

export interface CacheMeta {
  fetchedAt: string;
  providerCount: number;
  modelCount: number;
}

export interface ModelCandidate {
  providerId: string;
  model: ModelsDevModel;
}

export interface ModelIndex {
  byModelId: Map<string, ModelCandidate[]>;
  byCanonicalId: Map<string, ModelCandidate[]>;
}
