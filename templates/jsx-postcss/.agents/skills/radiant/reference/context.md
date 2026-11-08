# Context

Import all context APIs from `@ecopages/radiant/context`, not `@ecopages/radiant`.

## Contents

- Core pieces
- Provide vs consume
- Performance

## Core pieces

- `createContext(...)` — typed context token
- `@provideContext(...)` — attach a provider to a host
- `@consumeContext(...)` — inject the nearest matching provider object onto a field
- `@contextSelector(...)` — bind a **field** to the whole value or a slice; auto-rerenders `RadiantElement` hosts
- `@onContextUpdate(...)` — run a **method** on change; imperative side effects only

## Provide vs consume

Provide on a host that owns shared descendant state (theme, auth, cart, stores). Use `hydrate` and `serialize` when SSR must restore provider state on the client.

`@consumeContext(...)` when the host needs the provider object (`getContext()` / `setContext(...)`). Those later `getContext()` reads are snapshots — not reactive by themselves.

`@contextSelector(...)` when the host should render from the current context value. The field holds the selected value; render-owning hosts rerender automatically. Read `this.myField` in `render()` — no empty method body, no `this.update()`.

`@onContextUpdate(...)` when a context change should trigger imperative work (DOM mutations, attribute writes, logging).

`select` rule:

- Derived value computed purely from the context object → `select` onto the field
- Derived value also depends on instance state (a `@prop`) → bind the full context to a field and compute in `render()`. Do not add an intermediate `@state` or `@onContextUpdate` just to copy data

A host can use `@contextSelector` for render fields and `@onContextUpdate` for side effects together.

Avoid `@consumeContext` + `@onContextUpdate` + `@state` when a single `@contextSelector` field would suffice. The three-part pattern is only justified when the host must call `setContext(...)`.

Keep authoritative UI state in context and render from it. Do not split the same render decision across a local signal and `provider.getContext()` unless one is clearly an async-sourcing detail.

When stale display should persist across refetches, store one explicit display value in context (for example `visibleReport`) rather than juggling local copies.

## Performance

- Do not assume `provider.getContext()` will rerender the host when the provider changes
- Bind with `@contextSelector(...)`; read `this.myField` in `render()`
- Context **and** a `@prop` → bind full context, derive in `render()`
- `@onContextUpdate(...)` only for genuinely imperative reactions
- Do not mirror context into local `@state` to make rendering work
