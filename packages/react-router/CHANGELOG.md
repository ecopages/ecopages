# Changelog

All notable changes to `@ecopages/react-router` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Bug Fixes

- Replayed queued clicks through the next active runtime after React hands off control, so rapid React-to-non-React hops still land on the final target.
- Stopped React handoff cleanup from canceling its own in-flight navigation, so delegated browser-router documents still receive their pre-fetched handoff payload.
- Requested React route navigations as HTML documents so delayed-route races and cross-router handoffs exercise the correct browser fetch path.
- Unregistered the active React router runtime during browser-router handoff cleanup so stale React click handlers cannot keep intercepting navigation after leaving a React page.
- Standardized fetched React route props on the canonical `__ECO_PAGE_DATA__` script so router navigations no longer depend on a secondary fallback payload in mixed-shell documents.
- Stopped treating React island hydration assets as full page-route markers, so navigation from React routes back to non-React pages now falls back cleanly without noisy client-side errors.
- Cleaned up the active React page root before handing navigation back to browser-router so repeated React/non-React hops do not reuse a stale hydrated tree.
- Ignored stale browser-router fallback delegations once a newer React navigation has already won, preventing cross-router handoff races during rapid repeated clicks.
- Restored page-level HMR refreshes with persist layouts enabled by keeping current-page reloads targeted at the active React router owner.
- Reused fetched non-React documents during React-to-browser handoff so cross-runtime navigation no longer needs a second fetch or a hard reload boundary.
- Moved page module and props reads onto `window.__ECO_PAGES__.page`, keeping React-router navigation state aligned with the shared browser runtime namespace.

### Refactoring

- Routed browser handoff and current-page reloads through the shared internal navigation coordinator, reducing direct coupling with browser-router globals while preserving the existing public setup.
- Switched React route document detection from hydration-script heuristics to an explicit server-rendered document owner marker.
- Updated `package.json` dependencies to align with the new core adapter and esbuild build adapter versions.
- Internal peer dependency declarations updated for React 18+ and the new `@ecopages/core` API surface.
