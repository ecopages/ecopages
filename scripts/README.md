# Scripts

Repo-root utilities for packaging, release, and **debugging consumer apps** against local Ecopages builds.

## External app debug / bottleneck bench

Use [`debug-app.bench.mjs`](./debug-app.bench.mjs) to measure an app that lives **outside** this repository (for example a product monorepo). Do not commit app-specific harnesses here — pass the app path and routes as CLI args.

### When to use it

- Local `ecopages` changes feel slow in a real app
- You need to separate **SSR HTML** time from **dev-client-transform** time
- You want proof that page modules stay small (KB) and vendors are shared/cached

### Prerequisites

```bash
pnpm build:npm
```

The target app must already run with `ecopages dev` (same Node/Bun toolchain the app normally uses).

### Minimal run (already linked)

```bash
node scripts/debug-app.bench.mjs \
  --app /absolute/path/to/app \
  --paths /login,/dashboard \
  --port 3012
```

### Link local dist into the app, then bench

```bash
node scripts/debug-app.bench.mjs \
  --app ../techn.es/apps/agora \
  --workspace ../techn.es \
  --paths /login,/dashboard,/admin/sophia \
  --port 3012 \
  --link-local \
  --measure-modules
```

`--link-local` rewrites matching `ecopages` / `@ecopages/*` deps to `file:…/packages/*/dist`, runs `pnpm update` in the app, then restores `package.json` / workspace overrides in `finally`.

### What it measures

| Case | Meaning |
| --- | --- |
| `cold-at-listen` | Hit routes as soon as the server prints “running at” |
| `after-listen` | Wait for `phase=server-listen`, then hit routes |
| `warm-restart` | Restart without wiping caches; second process still cold for in-memory transform cache |

Each case records:

- HTTP status + wall time per `--paths` entry
- Startup-trace phases (`first-request-ssr`, `dev-client-transform`, …) when `ECOPAGES_STARTUP_TRACE=true` (set by the script)
- Optional `--measure-modules`: bytes + latency for `/assets/__eco_dev__/` and `/assets/vendors/` URLs discovered in HTML

JSON report default: `.audit/debug-app-bench.json` (directory is gitignored).

### How to attribute bottlenecks

| Symptom | Likely cause |
| --- | --- |
| High `first-request-ssr` / route `curlMs`, small `__eco_dev__` modules | App SSR / auth / data — not the client transform path |
| High `dev-client-transform`, page module **MB** | Still bundling an app cone; check import rewrite / vendor externalization |
| First nav many vendor requests, later navs fast | Expected Vite-like model; vendors should send long-cache headers |
| Transform warm ~1–50ms, cold still seconds | Vendor prebundle on first bare import — check first-hit stalls, not page size |

### Agent workflow (no skill required)

1. `pnpm build:npm` in this repo
2. Run `node scripts/debug-app.bench.mjs --help` and pass `--app` / `--paths`
3. Open the JSON report; compare `firstRequestSsrMs` vs `devClientTransformMs` vs module `bytes`
4. Fix the owning layer (app SSR vs core transform), rebuild, re-run the same command

Keep product-specific notes (DB, auth seeds, ports) in the product repo — not here.
