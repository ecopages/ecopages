# Docs app agent guide

## Content

- Body-only MDX lives in `src/content/docs/<section>/<slug>.mdx`.
- Do not add per-page imports or `export const config` in content files; ceremony belongs in the catch-all page and docs-kit compile scope.
- Optional metadata: `src/content/docs/<section>/<slug>.meta.json` (`description`, `llms: false`).

## Configuration

- App-specific docs-kit wiring lives in `src/docs-kit.instance.ts` (`defineDocsKit()`).
- Inject shell layout, MDX components, section icons, and burger events there — not inside `src/lib/docs-kit/`.
- Every content file must appear in the manifest; orphan `.mdx` files fail `buildDocsManifest()`.

## Navigation

- Edit `src/lib/docs-kit/manifest/docs-manifest.config.ts` to add, remove, or reorder pages.
- `getDocsManifest()` validates manifest entries and caches the built manifest.

## Routing

- All docs URLs are served by `src/pages/docs/[...slug]/index.tsx`.
- URL shape: `/docs/<section>/<slug>`.

## Compile path

- Runtime MDX compile: `src/lib/docs-kit/compile/compile-mdx.ts`.
- Shared plugin chain: `src/lib/docs-kit/compile/mdx-plugin-chain.ts` (also wired into `eco.config.ts`).
- Component scope: configured in `docs-kit.instance.ts` and injected at render time.

## Layout

- Docs chrome: `src/lib/docs-kit/layout/docs-layout/`.
- Docs bar: `src/lib/docs-kit/components/docs-bar/` composes kit-local `Breadcrumb` + `CopyForLlm`.
- Copy-for-LLM browser tests: `src/lib/docs-kit/components/copy-for-llm/copy-for-llm.test.browser.ts`.
- Breadcrumb items are resolved server-side via `resolveDocsBreadcrumb()` — not in client scripts.
- Section icons: `src/docs-section-icons.tsx`, referenced from `docs-kit.instance.ts`.
- Manifest JSON for client scripts: `<script type="application/json" id="docs-manifest-data">`.

## LLM exports

- `pnpm run generate:llms` writes `src/public/llms.txt` and `src/public/docs-llm/**` (static files, no API route).
- `dev` and `build` run `generate:llms` first so copy-for-LLM and `/llms.txt` stay in sync.

## Typing

- Pages use `eco.page<Props, JsxRenderable>()` (second generic matches `@ecopages/jsx` output).
- `staticProps` returns `{ props }` only; use the separate `metadata` callback for title/description.
- Catch-all params: `pathname.params.slug` is `string | string[]` — normalize via `resolveFromCatchAll`.
- Compiled MDX exports use `DocsMdxComponent` from `compile-mdx.types.ts`, not `EcoComponent`.

## Tests

- Run from `apps/docs`: `pnpm test` (vitest with `expect`, not Node `assert`).
- Docs-kit browser tests (`*.test.browser.ts`) run via the repo-root Vitest browser project (`vitest --project browser`).
- `vitest.setup.ts` imports `docs-kit.instance.ts` so kit modules resolve in unit tests.
- Do not use `.ts` extensions in TypeScript import paths.
- Use `tsx` for one-off scripts under `scripts/`.

## Tooling

- Package manager: pnpm (not Bun).
- JSX runtime: `@ecopages/jsx`.
