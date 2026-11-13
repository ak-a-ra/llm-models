# Changelog

## [1.2.0] - 2026-11-12

### Fixed
- Provider blocks that older versions injected from the models.dev catalog are detected and removed instead of being written back into `models.json`. They were the source of `baseUrl: must not have fewer than 1 characters` and `input.N: must be equal to one of the allowed values` schema errors.
- Every write now sanitizes the whole document, not only the provider being updated. Empty `baseUrl`/`apiKey` strings are removed, unsupported API ids (`cohere-chat`, `bedrock-converse`, `google-vertex-anthropic`) are mapped to Pi's supported set, and `video`/`audio`/`pdf` input modalities are stripped down to `text`/`image`.
- `contextWindow` and `maxTokens` fall back to valid defaults when a value is zero or negative.

### Added
- `/llm-models repair` - Remove stale catalog-generated provider blocks and sanitize `models.json` without contacting an endpoint.
- Regression tests for the schema bug (`test/sanitize.test.mjs`).

## [1.1.0] - 2026-11-12

### Changed
- `update` now only downloads models.dev metadata into a local cache. It no longer writes providers into `models.json`.
- `fetch` pulls the model list from a configured Pi endpoint (`<baseUrl>/models`) and enriches each model with matching models.dev metadata (context window, max output, reasoning, modalities, cost).
- `fetch [provider]` applies to one provider; without an argument it applies to every provider in `models.json` that has a `baseUrl` and an `api`.
- Generated `models.json` is validated before it replaces the live file. An invalid result is reported and the file is left untouched.
- Writes go through a temporary file and a rename, so a failed write cannot truncate the config.

### Fixed
- `input` modalities are limited to `text` and `image`.
- Empty `baseUrl` and `apiKey` values are dropped.
- Unsupported API identifiers are mapped to Pi's supported set.

## [1.0.0] - 2026-11-12

### Added
- Initial release
- `/llm-models update` - Fetch models from models.dev to local cache
- `/llm-models fetch` - Apply cached models to Pi config
- `/llm-models info` - Show cache metadata
- AI SDK package mapping for Pi API types
