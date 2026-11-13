# Agent instructions

Ecopages owns Pages, Layouts and HTTP handlers. Use Effect for asynchronous server workflows and Effect Schema for input validation. Run effects at the handler or startup boundary. In packaged builds Electrobun starts the compiled web app; `pnpm desktop:dev` starts the development server. Both open a native window on the loopback address.

- [Building with Ecopages](.agents/skills/ecopages/SKILL.md) covers Pages, Layouts, Integrations and Processors.
- [Radiant UI](.agents/skills/radiant-ui/SKILL.md) covers components, themes and semantic tokens.
- [Radiant hosts](.agents/skills/radiant/SKILL.md) covers custom element registration, server rendering and hydration.

Use `@effect/vitest` for Effect workflow tests and Vitest Browser Mode for tests that need the DOM.
