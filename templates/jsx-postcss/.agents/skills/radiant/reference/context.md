# Context

Import all context APIs from `@ecopages/radiant/context`, not `@ecopages/radiant`.

## Contents

- Core pieces
- Provide vs consume
- Definition order
- Field types
- Performance

## Core pieces

- `createContext(...)` — typed context token
- `@provideContext(...)` — attach a provider to a host
- `@consumeContext(...)` — inject the nearest matching provider object onto a field
- `@contextSelector(...)` — bind a **field** to the whole value or a slice; auto-rerenders `RadiantElement` hosts. On a method it throws: use `@onContextUpdate`.
- `@onContextUpdate(...)` — run a **method** on change; imperative side effects only

## Provide vs consume

Provide on a host that owns shared descendant state (theme, auth, cart, stores). Use `hydrate` and `serialize` when SSR must restore provider state on the client. Each provider takes a shallow copy of a plain-object or array `initialValue`, so hosts of one class do not share it; nested values are still shared.

`@consumeContext(...)` when the host needs the provider object (`getContext()` / `setContext(...)`). Those later `getContext()` reads are snapshots — not reactive by themselves. `setContext` merges a plain object one level deep and replaces any other value (array, string, number, boolean, `null`).

During SSR, consumed context is resolved after construction, before `initialize` and `@onUpdated`. Constructors and field initializers do not see it: read it in `initialize`, `@onUpdated` or `render()`.

`@contextSelector(...)` when the host should render from the current context value. The field holds the selected value; render-owning hosts rerender automatically. Read `this.myField` in `render()` — no empty method body, no `this.update()`.

`@onContextUpdate(...)` when a context change should trigger imperative work (DOM mutations, attribute writes, logging).

`select` rule:

- Derived value computed purely from the context object → `select` onto the field
- Derived value also depends on instance state (a `@prop`) → bind the full context to a field and compute in `render()`. Do not add an intermediate `@state` or `@onContextUpdate` just to copy data

A host can use `@contextSelector` for render fields and `@onContextUpdate` for side effects together.

Avoid `@consumeContext` + `@onContextUpdate` + `@state` when a single `@contextSelector` field would suffice. The three-part pattern is only justified when the host must call `setContext(...)`.

Keep authoritative UI state in context and render from it. Do not split the same render decision across a local signal and `provider.getContext()` unless one is clearly an async-sourcing detail.

When stale display should persist across refetches, store one explicit display value in context (for example `visibleReport`) rather than juggling local copies.

## Definition order

A provider defined after its consumers still answers. When a provider upgrades it dispatches a bubbling, composed `context-provider` event (`ContextProviderEvent`, an `Event` with `context` and `contextTarget`, exported from `@ecopages/radiant/context`), and unanswered consumers below it ask again, for plain and subscribing requests. A consumer that disconnects stops waiting; a request is answered once. A provider that only reconnects does not announce again. Lazy-defined providers need no import-order workaround.

## Field types

Under standard decorators the decorator checks that the field can hold the value it writes. Legacy decorators check nothing here ([decorators.md](decorators.md#field-types)).

- `@provideContext(...)`: `ContextProvider<typeof token>`. It is always installed, so the field cannot be optional.
- `@consumeContext(...)`: `ContextProvider<typeof token>`, which may be optional.
- `@contextSelector(...)`: the value `select` returns, or the whole context without `select`. The field may be optional or wider (`unknown`), not narrower.

```tsx
import { RadiantElement, customElement } from '@ecopages/radiant';
import { contextSelector, createContext, provideContext } from '@ecopages/radiant/context';
import type { ContextProvider } from '@ecopages/radiant/context/context-provider';

const counter = createContext<{ count: number }>(Symbol('counter'));

@customElement('counter-root')
export class CounterRoot extends RadiantElement {
	@provideContext({ context: counter, initialValue: { count: 0 } }) provider!: ContextProvider<typeof counter>;
}

@customElement('counter-label')
export class CounterLabel extends RadiantElement {
	@contextSelector({ context: counter, select: (value) => value.count }) count = 0;

	override render() {
		return <p>{this.count}</p>;
	}
}
```

## Performance

- Do not assume `provider.getContext()` will rerender the host when the provider changes
- Bind with `@contextSelector(...)`; read `this.myField` in `render()`
- Context **and** a `@prop` → bind full context, derive in `render()`
- `@onContextUpdate(...)` only for genuinely imperative reactions
- Do not mirror context into local `@state` to make rendering work
