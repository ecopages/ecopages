---
'@ecopages/core': minor
'@ecopages/react': minor
---

### Breaking Changes

React-specific renderer behavior now runs through `IntegrationRendererHooks`. Custom `ReactRenderer` subclasses that supplied rendering behavior through renderer overrides should move it to the `hooks` option, using `renderComponent`, `collectPageBrowserGraphContribution`, `normalizePageModule`, `documentContributions`, `documentAttributes`, or `buildIslandClientAssets` as applicable. A React renderer's custom hooks override the built-in React hooks with matching names.

React now supplies its page payload, document contributions, shell composition, and grouped island assets through the shared Integration renderer hooks. React routes now follow core's route-parameter precedence.
