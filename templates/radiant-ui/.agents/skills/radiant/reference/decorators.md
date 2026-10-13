# Decorators

## Contents

- Host definition
- Reactive data
- Paint and side effects
- DOM queries
- Events
- Callback utilities

## Host definition

- `@customElement(...)` — register the custom-element class; once per host class
- `@controller(...)` — register a controller identifier for `data-controller="..."` attachment; once per controller class

## Reactive data

- `@prop(...)` — public custom-element API: attribute conversion, reflection, optional bindings
- `@state` — internal mutable UI state
- `@signal` or `@signal(options)` — signal-backed host state / signal interop

`@signal` options:

- `bind` — JSX binding companion (`true`, or a custom name string)
- `initial` — default when the field initializer is omitted
- `source` — existing shared `WritableSignal` or `(host) => WritableSignal`
- `hydrate` — attribute type constant for SSR hydration via keyed JSON script

Bare `@signal` (no parentheses) creates a host-owned signal with defaults.

## Paint and side effects

- `@bindTo(...)` — copy a reactive field onto existing DOM (host or `ref`/`selector` descendant). One of `attr` | `bool` | `prop` | `text`; optional `invert`, `map`; array of targets to fan out. Missing nodes and non-reactive fields are skipped. A target with zero or several write kinds, or both `ref` and `selector`, throws at decoration. Not events, not focus, not node creation.
- `@onUpdated(...)` — procedures or derived state when a reactive member changes (focus, timers, joined ARIA, storage, analytics).

On a host that does **not** override `render()`, `@bindTo` is the paint API. `this.$` only patches ranges the host's own `render()` / `hydrate()` created.

Avoid updating the same watched property inside its own `@onUpdated(...)` unless the logic is guaranteed to settle.

## DOM queries

- `@query(...)` — rendered descendants by `data-ref` or selector
- `@querySlot(...)` — projected slot-assigned elements from an HTML-first `RadiantElement`

`@query` options: `ref` or `selector`; `all` for `Element[]`; `cache` (default `false`); `scope` `'light'` (default) | `'shadow'` | `'both'`. Prefer `ref` over broad selectors.

Use `@query` for a live element handle (focus, observers, third-party APIs). If a `@query` exists only so you can copy a field into `.textContent` / `.setAttribute` / `toggleAttribute`, use `@bindTo` instead. If the host owns `render()` and the node is a leaf in that view, use `this.$`.

## Events

- `@onEvent(...)` — declarative event subscription (lifecycle-owned)
- `@event(...)` — typed custom-event emitter for host-to-parent communication

`@onEvent` target — exactly one of `{ ref }`, `{ selector }`, `{ window: true }`, `{ document: true }`. `scope` is `'light'` | `'shadow'` | `'both'` (default `'light'`).

Delegation requires bubbling. `focus` / `blur` will not work — use `focusin` / `focusout`. Prefer `ref` for internal wiring; `selector` only when delegation is intentional; `window` / `document` only for truly global sources.

## Callback utilities

- `@bound` — bind a prototype method to the instance on access (timers, manual listeners, callback-style APIs)
- `@debounce(ms)` — delay bursty execution (search, resize, autosave)

Arrow-function fields are fine when instance-local allocation is acceptable. `@bound` and `@debounce(...)` can combine on the same method.
