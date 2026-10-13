# Reactive model

## Contents

- Plain reads
- Bindings
- Existing DOM (`@bindTo`)
- Derived bindings
- Class and style
- Performance rule

## Plain reads

Plain reads such as `this.count` are tracked when used during `render()` on a render-owning host. They are reactive by default and participate in host rerenders.

Use them for:

- conditional branches and comparisons
- derived strings that decide structure
- list shape and slot fallback
- `class` / `style` composition
- imperative code and event handlers outside JSX binding positions

## Bindings

Bindings (`this.$.count`, `this.bindings.count`, `this.bind('count')`) let the JSX runtime subscribe to a stable child or attribute position and patch it without a full host rerender.

Prefer bindings for:

- leaf text `{this.$.count}`
- stable child content that should patch in place
- whole attribute values `data-status={this.$.status}`
- structured `data` / `aria` entries when the bound value is the whole entry
- boolean attributes `disabled={this.$.busy}`
- `prop:*` bindings `prop:value={this.$.draft}`

Do not treat bindings as raw values. If logic needs a boolean, string, or number, use the plain property.

## Existing DOM (`@bindTo`)

`this.$` only patches ranges the host's own `render()` / `hydrate()` created. When the parent (or a view helper) already owns the markup, copy the field with `@bindTo`:

```ts
@prop({ type: Boolean, defaultValue: false })
@bindTo({ ref: 'trigger', attr: 'aria-expanded' })
open = false;
```

Exactly one of `attr`, `bool`, `prop`, or `text`. `ref` and `selector` are mutually exclusive; omit both to patch the host. Sit `@bindTo` on a `@prop` / `@state` / `@signal` field. Missing nodes and non-reactive fields are skipped. Two write kinds, or both `ref` and `selector`, throw when the decorator is applied.

`@onUpdated` does not replace this. Use it for procedures (focus, timers, joined ARIA, derived state).

## Derived bindings

**Member access** — simple object keys, inline in JSX. Memoized per key; no field initializer needed:

```tsx
render() {
  return <p>{this.$.config.label}</p>;
}
```

**`map`** — transforms, record lookups, non-property reads. Hoist to a create-once field:

```tsx
private readonly themeLabel = this.$.preference.map((preference) => THEME_CONFIG[preference].label);
```

Rules:

- member access inline in JSX is fine for simple object keys
- hoist `map` to a field initializer or cached host field — each `.map(...)` in `render()` creates a new derived binding
- object props are shallow — projections update on whole-object replacement, not in-place nested mutation
- bracket lookups need `map`: `this.$.preference.map((p) => THEME_CONFIG[p].label)`, never `THEME_CONFIG[this.$.preference]`

## Class and style

Treat `class` and `style` as render-time composition. They are normalized eagerly and usually express host render logic.

If styling should react without a host rerender, bind a state attribute such as `data={{ state: this.$.status }}` and let CSS key off that.

Use bindings confidently for child text, whole `data-*` / `aria-*` values, boolean attributes, and `prop:*`.

## Performance rule

- Value controls host render logic → plain read
- Value only feeds a stable JSX output position → binding
- Value copies onto existing DOM the host does not `render()` → `@bindTo`

```tsx
<article class={this.isExpanded ? 'user-card user-card--expanded' : 'user-card'} data={{ state: this.$.isExpanded }}>
	<h2>{this.$.name}</h2>
</article>
```
