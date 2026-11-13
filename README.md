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

Install as an official Pi package from GitHub:

```sh
pi install https://github.com/ak-a-ra/llm-models
```

Or add to `~/.pi/agent/settings.json`:

```json
{
  "extensions": ["https://github.com/ak-a-ra/llm-models"]
}
```

## Configuration

`fetch` applies to every provider in `models.json` that has a `baseUrl` and an `api`. Use `fetch <provider>` to target a single one.

The plugin only writes model IDs it received from the endpoint's `/models` list. models.dev enriches metadata (context window, max output, reasoning, modalities, cost). User customizations (`baseUrl`, `apiKey`) are preserved.

API identifiers are mapped from models.dev / AI SDK provider names to Pi's supported set (e.g. `cohere-chat` → `openai-completions`, `bedrock-converse` → `bedrock-converse-stream`).

### Quick start

```sh
pi install https://github.com/ak-a-ra/llm-models
/llm-models update
/llm-models fetch
pi reload
```

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

## Contributing

Bug reports and pull requests welcome on [GitHub](https://github.com/ak-a-ra/llm-models).

1. Fork the repo
2. Create a branch (`git checkout -b fix/...`)
3. Make changes, run `npm test`
4. Open a PR

## License

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
