# Agent notes

## Git

Always check the main branch.

## Models

Always use **Grok 4.6 High** at standard (non-Fast) speed for chats, agents, and subagents.

- Do not use Grok 4.6 Fast, `cursor-grok-4.6-high-fast`, or any other Fast variant.
- When launching subagents, inherit this session's model. Do not switch models.
- If a tool requires an explicit model slug and Grok 4.6 High (non-Fast) is not listed, use `inherit`. Do not substitute Fast or another model family.

## Testing

Cover type resolution, XML parsing, catalog merge, compatibility, 
and input grounding with Vitest (`make test` / `npm test`). 
Put those tests next to the logic (for example `src/lib/blocks/blocks.test.ts`).

Cover UI-specific behavior (port clicks, wiring interaction, layout, pan/zoom, drag) 
with Playwright (`make test-e2e` / `npm run test:e2e`). Prefer Playwright tests over launching browser subagents.

Do not repeat a UI walkthrough for inference cases that unit tests already cover
(`array`, `f2`, varargs, chains, F-bounded types, multi-file catalogs, and similar).
