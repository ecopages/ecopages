# Decorators

## Contents

- Host definition
- Reactive data
- Field types
- Paint and side effects
- DOM queries
- Events
- Callback utilities

## Host definition

- `@customElement(tag, options?)` — register the custom-element class; once per host class. Under legacy decorators it returns and registers a subclass (use the returned class when calling it imperatively); a subclass of a decorated class keeps its reactive accessors. `hostAttributes` gives every instance fixed attributes (`{ role: 'complementary' }`): written during server preparation and at the start of every connect, before `onConnected()`, and an attribute the author wrote is kept. Use `@bindTo` for attributes that depend on state. The `extends` option throws: hosts are autonomous elements.
- `@controller(...)` — register a controller identifier for `data-controller="..."` attachment; once per controller class

## Reactive data

- `@prop(...)` — public custom-element API: attribute conversion, reflection, optional bindings. The attribute is the kebab-case property name (`minWidth` is `min-width`, `max_width` is `max-width`); `attribute` sets another name, kept as written, so make it lowercase when authors write it in HTML. An authored attribute is read at upgrade and stays on the host; `reflect: true` only adds writing property changes back to it. Pass `transform` to override default converters (`type: Array` is JSON). `fromProperty` normalizes JS/JSX writes; `toAttribute` returning `null` or `''` omits the reflected attribute. `attribute: false` makes a prop property-only (no observed attribute, never reflected or serialized by SSR; `reflect: true` with it throws): use it for a live object such as a class instance, which a lossy JSON attribute would replace. Development SSR warns when a prop that keeps its attribute holds a class instance, function or cycle.
- `@attr(...)` — a field bound to a host attribute, read from and written to it; `source` names the attribute; it defaults to the kebab-case field name, as for `@prop`. Use it for `data-*` / `aria-*` configuration on a controller or an HTML-authored host, and `@prop` for a custom element's property API.
- `@state` — internal mutable UI state
- Upgrade safety: outside code may assign a `@prop` before the element is defined and the value is adopted (it wins over an authored attribute), so never defer a definition. `@state` and `@signal` are internal: a pre-upgrade value is discarded and development builds warn. A pre-upgrade value that shadows a class accessor (`get`/`set`, `accessor` field, MobX `@observable accessor`) also warns. Declare public input with `@prop`.
- `@signal` or `@signal(options)` — signal-backed host state / signal interop

`@signal` options:

- `bind` — JSX binding companion (`true`, or a custom name string)
- `initial` — default when the field initializer is omitted
- `source` — existing shared `WritableSignal` or `(host) => WritableSignal`
- `hydrate` — attribute type constant for SSR hydration via keyed JSON script

Bare `@signal` (no parentheses) creates a host-owned signal with defaults.

## Field types

Under standard decorators the declared field type is the source of truth. Options that carry a value (`defaultValue`, `initial`, `transform`, `converter`, `type`, and `source` on `@signal`) must agree with it, and a mismatch is a compile error on the decorator. Prefer an initializer so TypeScript infers the type (`@prop({ type: Number }) count = 0`). Write the type for a string literal union, for a field with no initializer (`?`, or `!` when a decorator or a default supplies the value) and for fields a decorator installs.

- A decorated field cannot be `declare` (TS1206) or `accessor`.
- `@query`: `T | null`, or `T[]` with `all: true` (`all` must be a literal). A single-element query is `null` when nothing matches, so guard it with `?.` or an early return; use `!` only where the host's own markup always renders the node.
- `@prop` and `@attr`: the `type` constant must fit the field (`String` a `string`, `Number` a `number`, `Boolean` a `boolean`, `Array` an array, `Object` a non-array object; `null` and `undefined` always fit; a union of parsed types fits none). A parser owns the value type instead, so `type` is not checked against the field: `transform.fromAttribute` on `@prop`, `converter.fromAttribute` on `@attr`. Pass the parser inline or with `satisfies`.
- `@attr` without `type` or a parser holds the raw string, so the field is `string | null | undefined` (a string literal union fits). A number or boolean field needs `type` or a parser.
- `defaultValue: null` and a `defaultValue` next to a parser do not throw. Without a parser, a `defaultValue` that does not match `type` throws at class definition on `@prop` and when a host is constructed on `@attr`.
- A field typed by the host class's own type parameter (`value: V` with `V extends string`) does not compile with a `type` constant. On `@prop` pass a parser that keeps the raw value; on `@attr` omit `type`.
- `@signal`: `WritableSignal<T>`, with `initial` a `T` and `source` a `WritableSignal<T>` or a function returning one. `@event`: `EventEmitter<Detail>`, not optional. Context decorators: [context.md](context.md).
- `@bindTo`: `map` receives the field type, and on a `@signal` field declared `WritableSignal<T>` the value `T`, so leave the parameter unannotated.
- Legacy decorators (`experimentalDecorators`) are supported but never see the field type, so none of this is checked there, and `@bindTo`'s `map` sees `unknown` unless you write `@bindTo<number>(...)`, with the whole field type, `undefined` included (`@bindTo<WritableSignal<number>>(...)` on a `@signal` field).
- A library that exports a shared decorator (`export const count = prop({ type: Number })`) can emit declarations: `ValueFieldDecorator`, `BoundedFieldDecorator` and the host types they name are exported from `@ecopages/radiant`, and `ContextHostLike` from `@ecopages/radiant/context`.

```ts
import { RadiantElement, customElement, prop, query } from '@ecopages/radiant';

@customElement('search-box')
export class SearchBox extends RadiantElement {
	@prop({ type: Number }) limit = 10;
	@query({ ref: 'input' }) input!: HTMLInputElement | null;
	@query({ ref: 'hint', all: true }) hints!: HTMLElement[];

	focusInput(): void {
		this.input?.focus();
	}
}
```

Full rules: `/docs/decorators`.

## Paint and side effects

- `@bindTo(...)` — copy a reactive field onto existing DOM (host or `ref`/`selector` descendant). One of `attr` | `bool` | `prop` | `text`; optional `invert`, `map`; array of targets to fan out. Missing nodes and non-reactive fields are skipped. A target with zero or several write kinds, or both `ref` and `selector`, throws at decoration. Not events, not focus, not node creation.
- `@onUpdated(...)` — procedures or derived state when a reactive member changes (focus, timers, joined ARIA, storage, analytics).

On a host that does **not** override `render()`, `@bindTo` is the paint API. `this.$` only patches ranges the host's own `render()` / `hydrate()` created.

Avoid updating the same watched property inside its own `@onUpdated(...)` unless the logic is guaranteed to settle.

## DOM queries

- `@query(...)` — rendered descendants by `data-ref` or selector, on a `RadiantElement` or a `RadiantController`

`@query` options: `ref` or `selector`; `all` for `T[]`; `cache` (default `false`: each read queries the DOM). Prefer `ref` over broad selectors. Field types and null-safe use: see [Field types](#field-types).

Use `@query` for a live element handle (focus, observers, third-party APIs). If a `@query` exists only so you can copy a field into `.textContent` / `.setAttribute` / `toggleAttribute`, use `@bindTo` instead. If the host owns `render()` and the node is a leaf in that view, use `this.$`.

## Events

- `@onEvent(...)` — declarative event subscription (lifecycle-owned)
- `@event(...)` — typed custom-event emitter for host-to-parent communication, on a `RadiantElement`

`@onEvent` takes a `type` and exactly one target: `{ ref }`, `{ selector }`, `{ host: true }`, `{ window: true }`, `{ document: true }` or `{ mediaQuery }`. Combining targets is a type error. `options` passes `AddEventListenerOptions`.

Delegation (`ref`, `selector`) requires bubbling. `focus` / `blur` will not work — use `focusin` / `focusout`, or pass `options: { capture: true }`. For a non-bubbling event on the host itself, such as `pointerenter` / `pointerleave`, use `host: true`, which listens on the Element Host (on a controller, its attached element) and does nothing on the server. Prefer `ref` for internal wiring; `selector` only when delegation is intentional; `window` / `document` only for truly global sources.

## Callback utilities

- `@bound` — bind a prototype method to each instance: standard decorators bind it when the instance is created, legacy decorators on first access (timers, manual listeners, callback-style APIs)
- `@debounce(ms)` — delay bursty execution (search, resize, autosave)

Arrow-function fields are fine when instance-local allocation is acceptable. `@bound` and `@debounce(...)` can combine on the same method.
