# Theming

Radiant UI separates colour, spacing, and radius into token packs. Components consume semantic roles (`--primary`, `--surface`, `--radius-control`, …). They must never target palette steps such as `--color-havelock-blue-800`.

## Token packs

Start from the default foundation, then layer only the packs the product needs:

```css
@import '@ecopages/radiant-ui/themes/default';
@import '@ecopages/radiant-ui/tokens/spacing/compact';
@import '@ecopages/radiant-ui/tokens/radius/soft';
@import '@ecopages/radiant-ui/styles.css';
```

Dark mode remaps colours (including overlay). Spacing, radius, elevation, typography, and motion stay mode-independent unless a theme documents otherwise.
