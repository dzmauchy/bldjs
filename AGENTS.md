# Agent notes

## Models

When launching subagents, keep the same model as this session. Do not switch to a different model.

## Testing

Cover type resolution, XML parsing, catalog merge, compatibility, 
and input grounding with Vitest (`make test` / `npm test`). 
Put those tests next to the logic (for example `src/lib/blocks/blocks.test.ts`).

Cover UI-specific behavior (port clicks, wiring interaction, layout, pan/zoom, drag) 
with Selenium (`make test-e2e` / `npm run test:e2e`). Prefer Selenium tests over launching browser subagents.

Do not repeat a UI walkthrough for inference cases that unit tests already cover
(`array`, `f2`, varargs, chains, F-bounded types, multi-file catalogs, and similar).
