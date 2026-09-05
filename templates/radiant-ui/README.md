# Radiant UI template

A starter with the components already built. Every [Radiant UI](https://radiant-ui.ecopages.app)
component is composed into a module you own, and a set of page blocks turns
those into the sections a real site needs — a header, a hero, feature grids, a
footer.

Install it, edit `src/site.config.ts`, rewrite the landing page from the blocks,
and delete what you do not use.

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## What is in here

| Path                       | What it holds                                                  |
| -------------------------- | -------------------------------------------------------------- |
| `src/site.config.ts`       | Name, navigation, footer. The first file to edit.              |
| `src/components/ui/`       | 56 composed components, one directory each.                    |
| `src/components/blocks/`   | 14 page sections built from those components.                  |
| `src/layouts/base-layout/` | The document shell: header, main, footer.                      |
| `src/pages/`               | Landing page, component catalog, form patterns, dashboard.     |
| `src/styles/tailwind.css`  | The theme import and app-wide styles.                          |
| `.agents/skills/`          | Mirrored Radiant and Radiant UI skill packs for coding agents. |
| `scripts/sync-skills.ts`   | Refreshes the agent skill packs from their published source.   |

Routes: `/` landing, `/components` the full catalog, `/forms` every control in
one validated form, `/dashboard` an application shell, `/about` and `/image`
Markdown pages.

## How a component module works

Each directory holds the component, its stylesheet, its browser script, and a
barrel:

```
src/components/ui/alert/
  alert.tsx         the composed component and its props type
  alert.css         @import of the package's compiled chrome
  alert.script.ts   the custom-element registration, loaded lazily
  index.ts          export { Alert } from './alert'
```

The component is an `eco.component()` that declares those files as its
dependencies. That is what makes the page pay only for what it renders:

```tsx
export const Alert = eco.component<AlertProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./alert.css'],
		scripts: [{ src: './alert.script.ts', lazy: { 'on:idle': true } }],
	},
	render: ({ title, icon, variant = 'info', layout, children, ...props }) => {
		/* picks banner or inline from the props you passed */
	},
});
```

Two rules follow from that:

- **Declare what you render.** Ecopages collects assets from
  `dependencies.components`, not from your JSX. A page that renders `<Alert>`
  must list `Alert` in its dependencies or the stylesheet never ships.
- **The composition is yours.** These are ordinary project files. Open
  `alert.tsx` and rewrite the render.

Components that pull in another component's chrome — `Select` borrows the
listbox and tag-group stylesheets — declare it themselves, so listing `Select`
is enough.

### Composed, not proxied

The modules are not pass-throughs. Radiant UI ships primitives that assemble
several different ways, and picking the wrong assembly usually fails silently:

- `Alert` picks banner or inline layout from whether you passed a `title`.
- `Select` and `Combobox` take `clearable` and `searchable`, each of which
  otherwise means hand-building a seven-part tree.
- `Field` owns the label, the hint, the error slot and form registration for
  whatever control sits inside it. The primitives render no visible label of
  their own by design, so a labelled control is always a `Field` wrapping one.
- `Toaster` is the mount point that makes `toast()` work; a lone `<rui-toast>`
  does nothing.
- `DisclosureGroup` is what makes stacked disclosures an accordion.
- `SidebarLayout` is the provider, the pane and the inset together; a `Sidebar`
  on its own sits on top of the page.

To assemble something the composition does not cover, import the `Rui*`
primitives from `@ecopages/radiant-ui/<name>` directly and keep the composed
component in the page's `dependencies.components` so the chrome still ships.

## Blocks

Page sections, each one a band with its own measure and rhythm. `Section` is the
shell they share; retune `--block-space-md` on it and every block follows.

`NavigationHeader`, `Hero`, `TextMedia`, `FeatureGrid`, `CardCarousel`, `Stats`,
`Testimonials`, `Faq`, `CallToAction`, `LogoCloud`, `Newsletter`, `Footer`, plus
`ComponentDemo` for the catalog.

They take content as props, so a page reads as content:

```tsx
<Hero
	eyebrow="Ecopages + Radiant UI"
	title="Every component you need, already wired up"
	description={site.description}
	actions={<Button href="/components">Browse components</Button>}
	media={<EcoImage {...heroPng} alt="" width={520} />}
/>
```

## Theming

`src/styles/tailwind.css` imports one theme. Radiant UI's chrome is compiled CSS
driven by custom properties, so swapping that line restyles everything:

```css
@import '@ecopages/radiant-ui/themes/default';
/* or: themes/glacier, themes/aurora, themes/default-compact-soft */
```

Finer control comes from the token packs — `tokens/colors/*`, `tokens/spacing/*`,
`tokens/radius/*`, `tokens/motion/*`. See
[radiant-ui.ecopages.app](https://radiant-ui.ecopages.app).

## Scripts

```bash
pnpm dev          # development server
pnpm build        # production build
pnpm preview      # serve the build
pnpm skills:sync  # refresh the agent skill packs
```

### Adding a component

Nothing generates these modules — they are yours. To wire up a component this
template does not cover yet, copy the closest existing directory, rename the
four files, and point them at the package export. `button/` is the smallest
example; `select/` is the one with borrowed chrome and a branching assembly.

### `skills:sync`

Mirrors the published skill packs into `.agents/skills/`, following each site's
`/skill.txt` index. The copies are committed so a fresh project works offline;
`--check` exits non-zero when they have drifted. See
[`.agents/README.md`](./.agents/README.md).

## Documentation

- [Ecopages](https://ecopages.app) — the framework
- [Radiant UI](https://radiant-ui.ecopages.app) — the component library
- [Radiant](https://radiant.ecopages.app) — the reactive host model
