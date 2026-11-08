---
'@ecopages/ecopages-jsx': patch
'@ecopages/image-processor': patch
'@ecopages/dev-toolbar': patch
---

The `@ecopages/jsx` and `@ecopages/radiant` peer and dependency ranges move to `^0.8.2` (`@ecopages/signals` `^0.8.2`, `@ecopages/radiant-ui` `^0.3.3` in the templates). Update them in your app with `pnpm add @ecopages/jsx@^0.8.2 @ecopages/radiant@^0.8.2 @ecopages/signals@^0.8.2`.

Radiant 0.8 removes `<slot>`: a host that renders its children uses `{this.slotted}` (and `this.slottedElements` in place of `@querySlot` and `getSlotElements()`), and named slots become properties. Radiant and JSX 0.7 also made `className` on a native element a type error: write `class`. The `ecopages` skills and templates now describe the 0.8 model.
