# Composition

## Contents

- Views vs hosts
- Light-DOM targets
- Attribute forwarding
- Accessible-name defaults

## Views vs hosts

Compose published `Rui*` views. Do not subclass a custom element just to arrange its UI.

Keep a convenient prop-based default on the primary view, and accept children for the equivalent explicit composition.

Light DOM is the default: style with theme roles and BEM `.rui-*` classes, not shadow parts.

## Light-DOM targets

Coordinating `rui-*` scripts are behavior hosts. They query light-DOM **targets** (`data-*` attributes and roles). Helpers stamp those targets; any markup with the same contract works inside the custom element. The host TSDoc lists the required tree. Prefer helpers unless you need a custom child tree.

Collection item `id` values (tabs, carousel slides, cycle-toggle items) are semantic keys, not literal DOM ids. Non-collection `id` props are DOM ids.

## Attribute forwarding

Rui views expose a declared DOM surface. Forwarded to that surface:

- global attributes
- `on:*` / `on-native:*` events
- direct `aria-*` / `data-*`
- structured `aria={{ ... }}` / `data={{ ... }}`
- `attr:` / `prop:` bindings

Direct kebab-case attributes win when both forms name the same value.

## Accessible-name defaults

For an overridable accessible-name default, keep direct `aria-label` in the forwarded props and use `withDefaultAriaLabel(aria, fallback)` from `@ecopages/radiant-ui/aria`. The helper fills only a missing structured `aria.label`; direct `aria-label` remains canonical. Keep managed ARIA state explicit rather than passing it through a defaults helper.
