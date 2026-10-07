# Project Watcher

The Project Watcher subscribes to source, includes, public assets, Processor watch paths, additional watch paths, configuration, dotenv files, and workspace-linked packages.

Filesystem events share one debounce window. After it closes, the watcher calls `applyDevFileChanges({ changed, created, deleted })` once. That marks server modules, Page Browser Graph records, HTML cache entries, and route-module records dirty without rebuilding them. An unopened Page is rebuilt on the next request. The browser is notified once per batch; creating and deleting Pages in the same window refreshes the Route Registry once.

At startup it resolves the application's declared dependencies, development dependencies, and optional dependencies through installed package directories, including hoisted installs. Real package roots outside any `node_modules` segment are watched directly. This covers server-only imports and packages with subpath-only exports without waiting for a browser request. Missing optional packages are skipped; aliases to the same root share a subscription.

Adding, changing, or removing a linked package file requests a runtime restart before HMR or Processor notifications. The existing lifecycle coalesces pending restart requests and delegates shutdown to the host. Before a workspace restart, generated `dist/assets/vendors` output is discarded: an unchanged package may contain bundled code from another edited linked dependency. The next process reloads server imports and rebuilds browser vendors. Embedded hosts without a restart callback receive a warning.

Linked package `node_modules` and dot entries are ignored. Application work and dist directories remain ignored, while application dotenv files remain restart inputs. Discovery runs again on startup; changing the application's dependency declarations or links requires restarting the session. Dependencies declared only by another package are not discovered transitively.

See [development](../dev/README.md) for vendor fingerprints and process supervision, and [core](../../README.md) for the architecture index.
