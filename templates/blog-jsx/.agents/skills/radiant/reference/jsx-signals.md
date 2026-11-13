# JSX with signals, without a host

`@ecopages/jsx` renders on its own with `createRoot(...)` and reads signals directly. Use this when a page or widget needs no custom-element host.

## Render once

Mount the view once and let signals carry every later change. Do not call `root.render(...)` on each state change: that rebuilds and compares the whole tree, and is only worth it for small or rarely changing views.

```tsx
/** @jsxImportSource @ecopages/jsx */
import { state, type State } from '@ecopages/signals';
import { createRoot, MapItems } from '@ecopages/jsx';

type Row = { id: number; label: State<string>; cls: State<string> };

const rows = state<Row[]>([]);

createRoot(document.querySelector('#app') as HTMLElement).render(
	<table>
		<tbody>
			<MapItems each={rows}>
				{(row) => (
					<tr classes={row.cls}>
						<td>{row.id}</td>
						<td>{row.label}</td>
					</tr>
				)}
			</MapItems>
		</tbody>
	</table>,
);
```

## Rules

- A signal (anything with `get()` and `subscribe(...)`) works as a child and as any attribute value: `classes`, `attr:`, `bool:`, `prop:`, `data-*`, `aria-*`. The renderer patches only that text node or attribute.
- Put a reactive class in `classes`, where a signal's value is normalized like a static one: a string, a list or a class map. `class` takes a plain string.
- A list is `<MapItems each={rows}>{(row) => ...}</MapItems>`, or `mapItems(rows, project)` from `@ecopages/signals` outside JSX. `each` must be a signal or subscribable holding an array, not a plain array.
- Each row renders once per item and is reused while the item stays in the list. Rows are keyed by item automatically; a row with its own `key` keeps it.
- Give each row the signals that change per row (label, selection class) and bind them in the row's JSX. The `MapItems` callback is untracked, so reading `row.label.get()` there does not subscribe the view and the text will not update.
- For a hand-written `computed` + `.map`, pass the signal, never `signal.get()`: reading a value there makes the whole list depend on it, and every row re-renders on each list change.
- To skip work for unchanged rows, return the same row object; `MapItems` does this. A new object with equal values is applied in full.
- To group several nodes under one key, use `<Fragment key={id}>`; the group moves as one entry when keyed siblings reorder.
- Keep the header and other static parts out of the list, so a list change touches only the rows.
- Delegate row events: one `on:click` on the list container, reading the row from `event.target.closest(...)`, instead of a handler per row.
- For a source with its own notifications but no `get()`/`subscribe(...)`, wrap it with `createSubscribableJsxValue({ getValue, subscribe })`.
- A same-tag element at the same position is kept when its bound attributes change (a spread gaining or losing `aria-describedby` keeps focus and caret). Give elements that must stay distinct a `key`. A custom element's dropped spread key is set to `undefined`. A JSX-attached listener cannot be removed with `removeEventListener(type, yourHandler)`.
- Install `@ecopages/signals` explicitly: `@ecopages/jsx` lists it as a peer dependency.

## Inside a Radiant host

A `RadiantElement` uses the same renderer, so a host's `render()` can return a view built this way. Inside a host, prefer the host model from the main skill: plain reads for render logic, `this.$.name` bindings for leaves, and `@signal` / `@state` fields over loose module signals.
