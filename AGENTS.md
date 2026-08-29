# Agent notes

## Models

Use Grok for this repo's agents **and** for every subagent (explore, computerUse, generalPurpose, and similar). Do not switch subagents to another model family.

## Testing

Cover type resolution, XML parsing, catalog merge, compatibility, and input grounding with Vitest (`make test` / `npm test`). Put those tests next to the logic (for example `src/lib/blocks/blocks.test.ts`).

Use the browser only for UI-specific behavior: port clicks, wiring interaction, layout, and other things a unit test cannot see.

Do not repeat a UI walkthrough for inference cases that unit tests already cover (`List.of`, `Map.of`, varargs, chains, F-bounded types, multi-file catalogs, and similar).
