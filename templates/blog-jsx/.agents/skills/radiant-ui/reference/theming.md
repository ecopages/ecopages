# Theming

Radiant UI ships one accessible default theme, Radiant Default. Components consume semantic roles (`--primary`,
`--surface`, `--radius-control`, …), not palette values.

```css
@import '@ecopages/radiant-ui/themes/default';
@import '@ecopages/radiant-ui/styles.css';
```

## Radiant Themes

Optional complete themes are published from `@ecopages/radiant-themes`, a separate package installed next to a
matching `@ecopages/radiant-ui` (its peer range names the minimum): GitHub, Cloudflare, VS Code, Vercel, Material Design, High Contrast, Windows 95,
Mac OS Classic, macOS, and Zed. Each owns its shape, spacing, typography, semantic colors, and component styling. Import one
theme in place of `themes/default`, never both.

```bash
pnpm add @ecopages/radiant-ui @ecopages/radiant-themes
```

```css
@import '@ecopages/radiant-themes/github';
@import '@ecopages/radiant-ui/styles.css';
```

Named variants such as `@ecopages/radiant-themes/github/compact` use the same internal composition with compact
spacing; the public API remains a complete theme import.

Themes define `--font-sans`, `--font-heading`, and `--font-mono` stacks but bundle no font files. To use a licensed
font, load it in the app and override those variables after the theme import.

## Dark mode

Every theme, Radiant Default included, switches to dark when an ancestor has the `dark` class (usually
`<html class="dark">`). It does not follow `prefers-color-scheme` by itself: set or remove the class from the user's
preference in the app. A `.dark` section inside a light page restyles the components inside it. To retheme, override
the roles (`--primary`, `--surface`), not the `--color-*` aliases.

## Radiant Default tuning

The default's neutral, primary, and secondary scales derive from the OKLCH seeds `--rui-neutral`, `--rui-primary`, and
`--rui-secondary`; secondary defaults to primary's hue plus 40 degrees. Error, warning, and success scales use fixed
red, amber, and green seeds; info follows primary through the semantic role map. `--rui-neutral-tint` (default 1.3), `--rui-density`, `--rui-radius-scale` (default 0.7), and `--rui-border-alpha` (default 11%) tune its
geometry and border strength. Interactive controls share the `--border` role. The foundation also
honors reduced motion, increased contrast, keyboard focus, and Windows forced-colors preferences. Dark mode remaps
colors; geometry and other foundational tokens remain mode-independent unless a theme documents otherwise.

## Theme lab links

`https://<docs host>/themes` previews every theme and builds custom ones. A link carries the whole theme in its query
string, so a link is enough to reproduce a theme in another project:

| Parameter                                                    | Meaning                                                                                                                                                                                                                      |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rui-theme`                                                  | Theme: `github`, `cloudflare`, `vscode`, `vercel`, `material`, `high-contrast`, `windows95`, `macos-classic`, `macos`, `zed`. Absent means Radiant Default.                                                                  |
| `rui-primary-hue`, `rui-secondary-offset`, `rui-neutral-hue` | Radiant Default seeds: `--rui-primary: oklch(52% 0.19 <hue>)`, `--rui-secondary: oklch(from var(--rui-primary) 63.5% 0.095 calc(h + <offset>))`, `--rui-neutral: oklch(62% calc(0.014 * var(--rui-neutral-tint, 1)) <hue>)`. |
| `rui-neutral-tint`                                           | Multiplies the grey chroma, 1 to 4, so the greys carry more of the neutral hue. `--rui-neutral-tint` is a package variable (default 1.3) that `--rui-neutral` reads.                                                         |
| `rui-density`, `rui-radius`, `rui-border-alpha`              | `--rui-density`, `--rui-radius-scale` (0 square to 4 fully rounded), `--rui-border-alpha` (percent, 0 to 100).                                                                                                               |
| `rui-font-sans`, `rui-font-heading`, `rui-font-mono`         | Fontsource ids. Install `@fontsource-variable/<id>` when a variable package exists, otherwise `@fontsource/<id>`, and override `--font-sans`, `--font-heading`, `--font-mono` after `styles.css`.                            |

Tuning parameters apply to Radiant Default only. The page also exposes the resolved implementation as JSON in
`<script id="theme-spec">` (packages, install commands, CSS, fonts, tuning) and, in browsers that support WebMCP,
through the tools `get_theme_implementation` and `set_theme`.

## Token packs

`themes/default` already loads the Radiant Default packs. To change one dimension, import a pack after the theme:

```css
@import '@ecopages/radiant-ui/themes/default';
@import '@ecopages/radiant-ui/tokens/spacing/compact';
@import '@ecopages/radiant-ui/styles.css';
```

| Dimension  | Packs                                                      |
| ---------- | ---------------------------------------------------------- |
| Spacing    | `tokens/spacing/compact`, `comfortable`, `default`, `wide` |
| Radius     | `tokens/radius/sharp`, `edgy`, `default`, `soft`           |
| Elevation  | `tokens/elevation/default`, `flat` (no shadows)            |
| Motion     | `tokens/motion/default`, `snappy`                          |
| Typography | `tokens/typography/default`                                |

Packs tune Radiant Default. An optional theme owns its shape and spacing: use its named variant (`@ecopages/radiant-themes/github/compact`) instead of layering a pack on it. Components read semantic roles (`--primary`, `--space-control-x`, `--radius-control`); never target palette steps from component CSS. A `--space-*` step follows the selected density, so it is safe to use.

## Stylesheets

Import `styles.css` once: it imports every component and primitive stylesheet exactly once. To ship only some components' CSS, read each component's `styles` list in `@ecopages/radiant-ui/style-dependencies` (JSON) and import those stylesheets in that order: the list includes the shared stylesheets the component's default composition needs. Published CSS is already compiled; theme values stay CSS custom properties, so themes can swap at runtime.
