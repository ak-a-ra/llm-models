# llm-models

A [Pi](https://github.com/earendil-works/pi) extension that syncs LLM model metadata from [models.dev](https://models.dev/) into Pi's `models.json` configuration.

## Commands

| Command | Purpose |
|---------|---------|
| `/llm-models update` | Download the models.dev catalog into `~/.pi/agent/llm-models-cache/` |
| `/llm-models fetch [provider]` | Pull `<baseUrl>/models` from a configured Pi endpoint and enrich models with models.dev metadata |
| `/llm-models repair` | Remove stale catalog-generated providers and sanitize `models.json` |
| `/llm-models info` | Show cache metadata |
| `/llm-models help` | Show usage |

## Two-step flow

1. `/llm-models update` — downloads `https://models.dev/api.json?type=all` (235+ providers, ~9000 models) to a local cache.
2. `/llm-models fetch` — reads each provider's `/models` list from the configured endpoint, matches model IDs against the cache, and writes enriched models into `~/.pi/agent/models.json`.

`update` never touches `models.json`; `fetch` is the only writer.

## Installation

Install as an official Pi package:

```sh
pi install ~/projects/llm-models
```

Or add to `~/.pi/agent/settings.json`:

```json
{
  "extensions": ["~/projects/llm-models"]
}
```

## Configuration

`fetch` applies to every provider in `models.json` that has a `baseUrl` and an `api`. Use `fetch <provider>` to target a single one.

The plugin only writes model IDs it received from the endpoint's `/models` list. models.dev enriches metadata (context window, max output, reasoning, modalities, cost). User customizations (`baseUrl`, `apiKey`) are preserved.

API identifiers are mapped from models.dev / AI SDK provider names to Pi's supported set (e.g. `cohere-chat` → `openai-completions`, `bedrock-converse` → `bedrock-converse-stream`).

## Schema safety

Pi's `models.json` schema only allows `text`/`image` input modalities and rejects empty `baseUrl`/`apiKey`. This extension:

- Validates the generated config against Pi's schema before writing
- Writes through a temp file + atomic rename so a bad write cannot truncate the config
- Strips unsupported `video`/`audio`/`pdf` modalities down to `text`/`image`
- Removes stale catalog-generated provider blocks left by older versions

## Development

```sh
npm install
npm run build   # compile TypeScript to dist/
npm test        # schema regression + live models.json validation
```

## License

MIT
