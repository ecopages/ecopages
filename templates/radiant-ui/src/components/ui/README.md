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

Checkbox and Switch are the exception: their label is their children, because
that is what the input is associated with.

## Borrowed chrome

Some components render another component's markup without rendering that
component's root element. `Select` embeds a listbox; `DateField` embeds a
calendar. Those need the sibling's **stylesheet**, and declare it as a path:

```ts
stylesheets: ['../listbox/listbox.css', './select.css'],
```

Not as `dependencies.components`. Two reasons:

1. The package already bundles the embedded element into the borrower's own
   script, so the sibling's script would be dead weight.
2. A declared component contributes a lazy script group keyed to a trigger
   attribute that lands on _that component's root element_. Nothing renders that
   root here, so the group would sit in the page's injector map with no element
   to fire it.

The exception is a sibling the package does **not** bundle — `Select`'s
`searchable` branch renders an autocomplete. That script joins Select's own
lazy group instead, so one trigger covers both.
