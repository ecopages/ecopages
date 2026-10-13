# Components

One directory per Radiant UI component. Each holds the component, its
stylesheet, its browser script, and a barrel:

```
alert/
  alert.tsx         the composed component and its props type
  alert.css         @import of the package's compiled chrome
  alert.script.ts   the custom-element registration, loaded lazily
  index.ts          export { Alert } from './alert'
```

Nothing generates these. To add one, copy the closest existing directory and
point it at the package export.

## Declare what you render

Ecopages collects assets from `dependencies.components`, not from your JSX. A
page that renders `<Alert>` must list `Alert` in its dependencies or the
stylesheet never ships.

## Labels belong to `Field`

Radiant UI's controls do not render a visible label — their own `label` prop is
the accessible name. `Field` owns the label, the hint, the error slot, and
registration with an ancestor `Form`:

```tsx
<Field name="email" label="Email" rules={{ required: 'Enter your email' }}>
	<Input type="email" />
</Field>
```

A `pattern` rule is encoded to `{ source, flags }` before paint — JSON cannot
hold a `RegExp` — and `field-revive.script.ts` turns it back into one when the
host connects.

Checkbox and Switch are the exception: their label is their children, because
that is what the input is associated with. RadioGroup keeps `name` on the
control: the radios share it.

## Borrowed chrome

Some components render another component's markup without rendering that
component's root element. `Select` embeds a listbox; `DateField` embeds a
calendar. Those need the sibling's **stylesheet**, and declare it as a path:

```ts
stylesheets: ['../listbox/listbox.css', './select.css'],
```

Not as `dependencies.components`. A declared component contributes a lazy
script group keyed to a trigger attribute that lands on that component's root.
Nothing renders that root here, so the group would sit in the page's injector
map with no element to fire it.

When the package already registers the nested host (Select → listbox), leave
the sibling script out. `DateField` and `DateRangePicker` stamp `rui-calendar`
but do not register it — they list `calendar.script.ts` on their own host so
the month grid exists when the popover opens. Do not list `Calendar` as a
component: its script waits until the calendar is visible, and the nested one
starts hidden.

`SearchableSelect` is the second export from `select/`. It is a separate
`eco.component` because a search field needs the autocomplete script, and
`dependencies.scripts` is static — a `searchable` prop on `Select` would ship
that script on every select.
