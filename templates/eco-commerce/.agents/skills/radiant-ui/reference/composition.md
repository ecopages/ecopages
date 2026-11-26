# Composition

## Contents

- Views vs hosts
- Named regions
- Views that take no children
- Light-DOM targets
- Attribute forwarding
- Accessible-name defaults

## Views vs hosts

Compose published `Rui*` views. Do not subclass a custom element just to arrange its UI.

Most `Rui*` exports are JSX views. `RuiMeter`, `RuiCalendar`, `RuiToaster`, `RuiToc` and `RuiTabs` are the custom-element classes themselves (each also exported under an `Rui*Element` alias): render them as JSX (`<RuiMeter value={40} />`), never call them as functions. A `<rui-*>` tag takes the same props as its class.

Composite views take a prop-based default and accept children for the equivalent explicit composition. When children are omitted, the view supplies default chrome (for example `RuiNumberField` renders its input and steppers).

Light DOM is the default: style with theme roles and BEM `.rui-*` classes, not shadow parts.

## Named regions

Parent JSX owns the children you pass. The view places them, and the custom element coordinates behavior over that tree; it does not place them through its own `render()` and `this.slotted`. Fill a named region with a Composition Helper (`RuiDialogTitle`, `RuiNumberFieldInput`) or a view prop (`trigger`, `primary` / `secondary`). Do not use `slot="name"`.

## Views that take no children

Some elements render their own content from props and state: `RuiMeter`, `RuiToc`, `RuiToast`, `RuiToaster`, `RuiDateInput` and `RuiCalendar`, plus `RuiSeparator`. Their props type `children` as `never`, as do the helpers that forward to them (`RuiDateFieldInput`, `RuiDateFieldCalendar`, `RuiDateRangePickerStartInput`, `RuiDateRangePickerEndInput`, `RuiDateRangePickerCalendar`). Passing children is a type error. Pass the content through props, or render it next to the component (a hint below `RuiDateInput`). Use the imperative `toast()` API for toasts.

## Light-DOM targets

Coordinating `rui-*` elements are behavior hosts. They query light-DOM **targets** (`data-ref`, `data-*` attributes and roles), never BEM class names. Views and helpers stamp those targets; any markup with the same contract works inside the custom element. Each component page lists the required tree. Prefer the views unless you need a custom child tree.

For example, a bare `<rui-tooltip>` renders nothing by itself: author `[data-ref="trigger"]` and `[data-ref="tooltip"]` inside it, or use `RuiTooltip`.

Collection item `id` values (tabs, carousel slides, cycle-toggle items) are semantic keys, not literal DOM ids. Non-collection `id` props are DOM ids.

## Attribute forwarding

Rui views expose a declared DOM surface. Forwarded to that surface:

- global attributes
- `on:*` / `on-native:*` events
- direct `aria-*` / `data-*`
- structured `aria={{ ... }}` / `data={{ ... }}`
- `attr:` / `prop:` / `bool:` bindings

Direct kebab-case attributes win when both forms name the same value, and a direct `null` suppresses the structured value. Coordinator views document exceptions: `RuiAlert` forwards surface props to its inner `role="alert"` element.

Compose `class` with `cx` from `@ecopages/radiant-ui/cx`. Write `class`, not `className`: on a native element `className` is a type error and is not rendered.

## Accessible-name defaults

For an overridable accessible-name default, keep direct `aria-label` in the forwarded props and use `withDefaultAriaLabel(aria, fallback)` from `@ecopages/radiant-ui/aria`. The helper fills only a missing structured `aria.label`; direct `aria-label` remains canonical. Keep managed ARIA state explicit rather than passing it through a defaults helper.
