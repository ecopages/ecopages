# Hosts

## Contents

- RadiantElement vs RadiantController
- Public props vs internal bindings
- Children

## RadiantElement vs RadiantController

Default to `RadiantElement` when the host should own a custom-element view. Hosts are autonomous custom elements: `@customElement` rejects the `extends` option, so render a `<button>` inside `<fancy-button>` instead of extending `HTMLButtonElement`.

Choose `RadiantController` when behavior should attach to existing DOM without defining a custom element.

Both share the same decorator-driven reactive model. `@event` needs a `RadiantElement`; a controller cannot use it.

Choose a simpler `RadiantElement` shape when the host is mainly authored light DOM, string-template based, or a lower-level custom element embedded inside another JSX tree. Copy fields onto that DOM with `@bindTo`. `this.$` is for hosts that override `render()`. `@onUpdated` is for procedures, not those copies.

## Public props vs internal bindings

Separate surfaces:

- **Public props** — what consumers may pass from JSX or attributes. Declare them with `declare readonly [JSX_PROPS]?: Props`.
- **Internal bindings** — what `this.$`, `this.bindings`, and `this.bind(...)` expose inside the component

If the external API and internal reactive surface differ, use separate types.

```tsx
import type { JSX_PROPS } from '@ecopages/jsx';
import { RadiantElement, customElement, prop, state } from '@ecopages/radiant';

export type UserCardProps = {
	name?: string;
	avatarUrl?: string;
};

type UserCardBindings = UserCardProps & {
	isExpanded: boolean;
};

@customElement('user-card')
export class UserCard extends RadiantElement<UserCardBindings> {
	declare readonly [JSX_PROPS]?: UserCardProps;

	@prop({ type: String, defaultValue: 'Anonymous' }) name!: string;
	@prop({ type: String, defaultValue: '' }) avatarUrl!: string;
	@state protected isExpanded = false;
}

<UserCard name="Ada" avatarUrl="/ada.png" />;
```

Use the registered class directly as the JSX element type. To write the tag (`<user-card>`) without importing the class, add it to `HTMLElementTagNameMap`; the class's `JSX_PROPS` types it the same way. `prop:*` accepts any writable public instance property, `@state` fields included, so mark internal state `protected` or `private` to keep it out of the JSX surface. Readonly fields and getters without a setter are rejected.

`@prop` HTML attributes are the kebab-case property name (`avatarUrl` is `avatar-url`), on the client and in SSR; JSX keeps the camelCase name.

If the component never uses `this.$`, `this.bindings`, or `this.bind(...)`, omit the generic.

## Children

A render-owning `RadiantElement` that a JSX view creates receives that view's JSX children as one **Children Value**. `{this.slotted}` in its `render()` places it (`{this.slotted ?? fallback}` when it is `null`), and every render of the parent view hands it over again, so added, removed and reordered children and binding updates inside them show up, even while the host hid them.

Named regions are properties:

```tsx
import type { JsxRenderable } from '@ecopages/jsx';
import { RadiantElement, customElement, state } from '@ecopages/radiant';

@customElement('x-card')
export class XCard extends RadiantElement {
	@state header: JsxRenderable = null;

	override render() {
		return (
			<section>
				<header>{this.header}</header>
				{this.slotted}
			</section>
		);
	}
}
```

```tsx
<x-card header={<h2>{title}</h2>}>
	<p>Body</p>
</x-card>
```

- An unprefixed name binds as a property on a custom element. Write `prop:name` only for a name that binds as an attribute by default, such as `title` or `id`.
- `<slot>` and `slot="name"` are ordinary HTML in a Radiant view.
- Nodes appended to the host with DOM APIs are not slotted. Change the children in the parent view instead.
- Place `this.slotted` once per render, or forward it to a host the view renders (`<x-card>{this.slotted}</x-card>`); a named region forwards as a property. `this.slottedElements` lists the top-level elements it rendered to; it is empty before the first client render and on the server. To show an element twice, render a `cloneNode(true)` copy kept in state: a snapshot without the original's listeners or bindings.
- Define custom elements before rendering the views that use them. A tag defined after a view rendered it takes those children as **Authored Children**, does not follow later edits, and development builds warn.

**Authored Children** are children written as HTML, created with DOM APIs, or rendered on the server outside every host's view or in plain mode. The host captures them once, before its first render, into the same `this.slotted`; nodes appended later are not slotted. Server-rendered hosts: see [SSR hydration](ssr.md#hydration).

A custom element that is not a Radiant host, or a `RadiantElement` without a `render()` override, keeps its JSX children as DOM nodes inside it.
