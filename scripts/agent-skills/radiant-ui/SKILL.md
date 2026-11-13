---
name: building-with-radiant-ui
description: >-
    Guides agents building interfaces with @ecopages/radiant-ui — focused
    imports, light-DOM views, composition helpers, form values, themes, and
    semantic tokens. Use when scaffolding or composing Radiant UI components,
    wiring forms, loading themes, or choosing token packs.
---

# Building with Radiant UI

Radiant UI is a light-DOM component library on the Radiant reactive host model. Custom elements use the `rui-*` tag prefix. Public TypeScript and JSX helpers use the `Rui*` prefix.

## When to use this skill

- Installing or composing `@ecopages/radiant-ui` components in an application
- Wiring Radiant UI controls into forms and reading their values
- Loading themes and the aggregate stylesheet
- Choosing colour, spacing, radius, elevation, or motion token packs
- Styling against semantic roles instead of palette steps

For exhaustive generated docs, use [/llms.txt](/llms.txt). For `RadiantElement` / `RadiantController` authoring, use the [Radiant skill](https://radiant.ecopages.app/skill/SKILL.md).

## Install and load styles

```bash
pnpm add @ecopages/radiant-ui
```

Radiant, JSX, and Signals install as peers. Load a theme and the aggregate stylesheet in the app shell. Import focused modules; import the root entry only when the app needs every custom element.

```ts
import '@ecopages/radiant-ui/themes/default';
import '@ecopages/radiant-ui/styles.css';
import { RuiDisclosure, RuiDisclosureGroup } from '@ecopages/radiant-ui/disclosure';
import { RuiButton } from '@ecopages/radiant-ui/button';
```

Importing a component subpath registers its custom elements, nested ones included. Import only documented entries: shared code ships in `dist/chunks/` under content-hash names that change between builds. Presentational helpers that are not custom elements (`RuiButton`, `RuiInput`, `RuiTextarea`, `RuiLabel`, `RuiHeading`, `RuiChip`, and similar) come from their subpath too.

With server rendering, a view rendered on the server does not register its elements in the browser. Import each component subpath in a client script, before the views that use it render or hydrate.

## Reference modules

Read only the modules relevant to the task. Each file is one level deep from this entry.

| Module                                               | Read when                                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [reference/composition.md](reference/composition.md) | Views vs hosts, named regions, childless views, light-DOM targets, attribute forwarding, ARIA                      |
| [reference/forms.md](reference/forms.md)             | `RuiField` / `RuiForm`, `rui-change`, multi-value `value`, form-associated controls                                |
| [reference/theming.md](reference/theming.md)         | Radiant Default and Radiant Themes, dark mode, token packs, semantic roles vs palette steps, selective stylesheets |

## Critical rules

1. Import `@ecopages/radiant-ui/<slug>` for each component the app ships. Prefer focused imports over the root barrel.
2. Load one theme (`@ecopages/radiant-ui/themes/default` or a complete theme from `@ecopages/radiant-themes`) and `styles.css` once in the app shell. Component views do not import their own CSS. Dark mode is a `dark` class on an ancestor.
3. Style against semantic roles and system tokens, never raw palette steps or ad-hoc Tailwind colour scales.
4. Compose with `Rui*` views and Composition Helpers. Pass named regions as helpers or view props (`RuiDialogTitle`, `trigger`, `primary`), never `slot="name"`.
5. Do not pass children to views whose element renders its own content (`RuiMeter`, `RuiToc`, `RuiToast`, `RuiToaster`, `RuiDateInput`, `RuiCalendar`, `RuiSeparator`, and the date-field / date-range-picker parts that forward to them). It is a type error.
6. Read multi-value controls as `string[]` (`number[]` for `rui-slider`) and listen for the bubbling `rui-change` event.
7. In HTML, write host attributes in kebab-case (`<rui-sidebar min-width="200">`); JSX keeps the camelCase prop (`<RuiSidebar minWidth={200} />`).
8. Use native HTML for links, tables, and landmarks. Those are not shipped as widgets.
9. Author new reactive hosts with the Radiant skill. This pack covers consuming Radiant UI, not replacing `@ecopages/radiant`.

## Resources

Start with this skill pack for application work. Full docs index: [llms.txt](/llms.txt); page exports under `/docs-llm/<section>/<slug>.md`.

- [Introduction](/docs/getting-started/introduction)
- [Themes](/docs/getting-started/theming) and [Tokens](/docs/getting-started/tokens)
- [Radiant host skill](https://radiant.ecopages.app/skill/SKILL.md)
