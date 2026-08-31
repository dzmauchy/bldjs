# Agent notes

## Git

Always check the main branch.

Do not subscribe to Cursor GitHub CI/PR watches (`cursor-subscriptions`).
They are unreliable here. After a push, read status with `gh pr checks`
and `gh run view`.

## Models

Keep the model selected at the start of this session. Do not switch models mid-chat, mid-run, or when launching subagents.

This project expects **Grok 4.6 High** at standard (non-Fast) speed. If that is what the user selected, stay on it for chats, agents, and subagents.

- Do not switch to Grok 4.6 Fast, `cursor-grok-4.6-high-fast`, Auto, or any other Fast variant.
- Do not switch to another model family.
- When launching subagents, inherit this session's model (`inherit`). Do not pass a different slug.
- If a tool requires an explicit model slug and the selected model is not listed, use `inherit`. Do not substitute Fast or another family.

`AGENTS.md` is an instruction to agents. It does not lock the Cursor model picker. To keep the initially selected model in the product:

1. Pick a named model, not Auto.
2. Turn Fast off (Grok 4.6 Fast is the default speed on Pro and higher).
3. Set Cursor Settings → Models and Cloud Agents → Default model to that same choice.
4. For custom subagents, set `model: inherit` (or pin with `[fast=false]`).
5. Set Explore to Inherit from parent under Settings → Agents → Subagents.

## Testing

Cover type resolution, XML parsing, catalog merge, compatibility, 
and input grounding with Vitest (`make test` / `npm test`). 
Put those tests next to the logic (for example `packages/xml/src/blocks/blocks.test.ts`).

Cover UI-specific behavior (port clicks, wiring interaction, layout, pan/zoom, drag) 
with Playwright (`make test-e2e` / `npm run test:e2e`). Prefer Playwright tests over launching browser subagents.

Do not repeat a UI walkthrough for inference cases that unit tests already cover
(`array`, `f2`, varargs, chains, F-bounded types, multi-file catalogs, and similar).
