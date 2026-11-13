---
name: radiant-reactive-host-author
description: >-
    Author, refactor, review, or explain Radiant reactive hosts built with
    @ecopages/radiant. Use when the user asks for a RadiantElement or
    RadiantController, custom elements with @prop/@state/@signal, controller-attached
    authored DOM, JSX-host rendering, slotted content, SSR hydration, internal
    bindings, @bindTo paint onto existing DOM, or when to use plain reactive
    reads versus this.$ / this.bindings / this.bind(...). Also use when updating
    docs, examples, or playground code so the output follows Radiant's shared
    reactive host model, and when rendering @ecopages/jsx without a host using
    signals.
---

# Radiant Reactive Host Author

Author Radiant hosts against the framework's rendering model. Start here; read a reference module only when the task needs it.

- Docs: https://radiant.ecopages.app/docs
- Skill index: https://radiant.ecopages.app/skill.txt
- LLM index: https://radiant.ecopages.app/llms.txt

Use `llms.txt` for a compact map, then the full docs for API details.

## When to use this skill

- Creating or editing a `RadiantElement` or `RadiantController`
- Choosing `@prop` / `@state` / `@signal`, or `@customElement` / `@controller`
- Choosing plain reads (`this.count`) vs JSX bindings (`this.$.count`) vs `@bindTo`
- Wiring SSR, hydration, host rendering, or slotted content
- Reviewing docs or examples so they teach the Radiant model, not React habits
- Rendering `@ecopages/jsx` with `createRoot(...)` and signals, without a host

## Import paths

| Surface                                                                                       | From                                        |
| --------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Hosts, `@customElement`, `@controller`, common host decorators                                | `@ecopages/radiant`                         |
| `createContext`, `@provideContext`, `@consumeContext`, `@contextSelector`, `@onContextUpdate` | `@ecopages/radiant/context`                 |
| SSR helpers                                                                                   | `@ecopages/radiant/server/*`                |
| `renderToString`, `withServerCustomElementRenderHook`, SSR scope helpers                      | `@ecopages/jsx/server`                      |
| Client hydrator for SSR pages                                                                 | `@ecopages/radiant/client/install-hydrator` |
| `isServer`                                                                                    | `@ecopages/radiant/is-server`               |
| `JSX_PROPS`, `JsxRenderable` (types)                                                          | `@ecopages/jsx`                             |
| `setDevWarningsEnabled`                                                                       | `@ecopages/jsx/jsx-dev-runtime`             |

## Host choice

- `RadiantElement` — autonomous custom-element host. Override `render()` to own a JSX view; skip it to keep authored light DOM.
- `RadiantController` — behavior attaches to authored DOM; no custom-element host.

Same reactive contract. The choice is ownership of the outer host, not a different state model.

## Core model

Three paint paths. They are not interchangeable:

- `this.count` — raw reactive read; tracked in `render()`; drives host rerenders
- `this.$.count` / `this.bindings.count` / `this.bind('count')` — JSX binding; patches a leaf the host's own `render()` / `hydrate()` created
- `@bindTo(...)` — copy a `@prop` / `@state` / `@signal` field onto existing DOM (the host, or a `ref` / `selector` descendant). Sit it on the field. Do not `@query` a node only to write into it.

Use a **plain read** when the value shapes render logic (branches, comparisons, list shape, slot fallback, `class` / `style` composition, handlers). Use a **JSX binding** for leaf text, whole attribute values, boolean attrs (`hidden={this.$.closed}`, or `bool:name` for a non-standard one), and `prop:*` in `render()`. Use **`@bindTo`** for the same leaf writes when the host does not own that DOM. Never use a JSX binding as a raw value in control flow. `@onUpdated` is a procedure (focus, timers, joined ARIA), not a paint API.

```tsx
<article class={this.isExpanded ? 'user-card user-card--expanded' : 'user-card'} data={{ state: this.$.isExpanded }}>
	<h2>{this.$.name}</h2>
</article>
```

Compose `class` and `style` at render time when they follow host render logic. A binding in `classes` also works (`classes={this.$.variant}`): its value is normalized like a static one and patches the attribute without a host rerender. `class` takes a plain string. A state attribute (`data={{ state: this.$.status }}`) that CSS keys off is the other no-rerender option.

When the host keeps authored markup instead of `render()`:

```ts
@prop({ type: Boolean, defaultValue: false })
@bindTo({ ref: 'root', bool: 'hidden', invert: true })
open = false;
```

## Reference modules

Read only the modules relevant to the task. Each file is one level deep from this entry.

| Module                                                     | Read when                                                                                                                                 |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [reference/reactive-model.md](reference/reactive-model.md) | Bindings vs plain reads vs `@bindTo`, attribute rules (`bool:`, `false`, `class`), derived `.map`, class/style                            |
| [reference/hosts.md](reference/hosts.md)                   | Element vs controller, public props vs internal bindings types, children and named regions                                                |
| [reference/decorators.md](reference/decorators.md)         | `@prop` / `@attr` / `@state` / `@signal`, field types, `@bindTo`, `@query`, `@onEvent`, `@onUpdated`, `@bound`, `@debounce`               |
| [reference/context.md](reference/context.md)               | Provide/consume, `@contextSelector` vs `@onContextUpdate`, manual `ContextRequestEvent` and other protocol libraries, context field types |
| [reference/ssr.md](reference/ssr.md)                       | Server entrypoints, hydrate modes, nested and page-level hydration, render scope                                                          |
| [reference/authoring.md](reference/authoring.md)           | Authoring rules, development warnings, review checklist, output shape                                                                     |
| [reference/jsx-signals.md](reference/jsx-signals.md)       | `@ecopages/jsx` with `createRoot` and signals, no host: render once, computed keyed lists, signals in attributes                          |

## Critical rules

1. Plain reads for control flow and `class`/`style`; JSX bindings for stable `render()` leaves.
2. Do not call `.map(...)` inside `render()` — hoist derived bindings to a field.
3. Reassign arrays and objects; in-place mutation does not trigger updates.
4. Omit the `Bindings` generic unless the host uses `this.$`, `this.bindings`, or `this.bind(...)`.
5. `@bindTo` copies a reactive field onto existing DOM. Missing nodes and non-reactive fields are skipped. Two write kinds, or both `ref` and `selector`, throw at decoration.
6. `@query` is a live element handle (focus, observers, third-party APIs) — not a way to copy a field into a node.
7. Import context from `@ecopages/radiant/context`, not the root entry.
8. Radiant SSR is light-DOM only. Prefer explicit `mode: 'plain'` or `mode: 'hydrate'`. In hydrate mode, define a parent host on the client too: a host inside a parent host's view stays inert until the parent hydrates.
9. Type decorated fields as the decorator checks them ([field types](reference/decorators.md#field-types)): prefer an initializer, never `declare` a decorated field, and treat a `@query` field as `T | null` (`T[]` with `all: true`), guarding each use.
10. A view hands a render-owning host its children as one value: `{this.slotted}` places them (`{this.slotted ?? fallback}` for a fallback), and a named region is a property (`<x-card header={<h2 />}>`). `<slot>` is an ordinary element. Change children in the parent view, not with DOM APIs, and define custom elements before rendering views that use them ([children](reference/hosts.md#children)).
11. Declare public props with `declare readonly [JSX_PROPS]?: Props` and render the class directly (`<UserCard name="Ada" />`). `@prop` HTML attributes are kebab-case (`minWidth` is `min-width`); JSX keeps camelCase. Keep internal `@state` `protected` or `private`.

## Resources

Start with this skill pack. Full docs index: [llms.txt](/llms.txt); page exports under `/docs-llm/<section>/<slug>.md`.
