---
'@ecopages/postcss-processor': patch
---

The Tailwind presets no longer log `postcss-calc` "Erroneous area" warnings for CSS Relative Color Syntax such as `oklch(from var(--x) l calc(c * 0.29) h)`. The presets now use `cssnano` 9, whose `postcss-calc` leaves color channel keywords alone.
