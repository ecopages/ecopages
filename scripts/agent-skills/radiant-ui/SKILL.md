---
name: building-with-radiant-ui
description: >-
    Guides agents building interfaces with @ecopages/radiant-ui — focused
    imports, light-DOM views, themes, and semantic tokens. Use when scaffolding
    or composing Radiant UI components, wiring themes, or choosing token packs.
---

# Building with Radiant UI

Radiant UI is a light-DOM component library on the Radiant reactive host model. Custom elements use the `rui-*` tag prefix. Public TypeScript and JSX helpers use the `Rui*` prefix.

## When to use this skill

- Installing or composing `@ecopages/radiant-ui` components in an application
- Loading themes and the aggregate stylesheet
- Choosing colour, spacing, or radius token packs
- Styling against semantic roles instead of palette steps

For exhaustive generated docs, use [/llms.txt](/llms.txt). For `RadiantElement` / `RadiantController` authoring, use the [Radiant skill](https://radiant.ecopages.app/skill/SKILL.md).

## Install and load styles

```bash
pnpm add @ecopages/radiant-ui
```

Radiant, JSX, and Signals install as peers. Load a theme and the aggregate stylesheet before registering elements. Import focused modules; do not pull the root entry unless the app needs every custom element.

```ts
import '@ecopages/radiant-ui/themes/default';
import '@ecopages/radiant-ui/styles.css';
import '@ecopages/radiant-ui/disclosure';
import { RuiDisclosure, RuiDisclosureGroup } from '@ecopages/radiant-ui/disclosure';
import { RuiButton } from '@ecopages/radiant-ui/button';
```

Presentational helpers that are not custom elements (`RuiButton`, `RuiInput`, `RuiTextarea`, `RuiLabel`, `RuiHeading`, `RuiChip`, and similar) still come from their subpath.

## Reference modules

Read only the modules relevant to the task. Each file is one level deep from this entry.

| Module                                               | Read when                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| [reference/composition.md](reference/composition.md) | Views vs hosts, light-DOM targets, attribute forwarding, ARIA defaults |
| [reference/theming.md](reference/theming.md)         | Token packs, semantic roles vs palette steps, dark mode                |

## Critical rules

1. Import `@ecopages/radiant-ui/<slug>` for each component the app ships. Prefer focused imports over the root barrel.
2. Load theme CSS and `styles.css` in the app shell. Component views do not import their own CSS.
3. Style against semantic roles and system tokens, never raw palette steps or ad-hoc Tailwind colour scales.
4. Use native HTML for links, tables, and landmarks. Those are not shipped as widgets.
5. Author new reactive hosts with the Radiant skill. This pack covers consuming Radiant UI, not replacing `@ecopages/radiant`.

## Resources

Start with this skill pack for application work. Full docs index: [llms.txt](/llms.txt); page exports under `/llms-content/.../*.txt`.

- [Introduction](/docs/getting-started/introduction)
- [Themes and tokens](/docs/getting-started/theming)
- [Radiant host skill](https://radiant.ecopages.app/skill/SKILL.md)
