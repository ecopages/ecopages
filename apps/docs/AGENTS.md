# Docs app agent guide

## Content

- Docs live under `src/content/docs/<section>/<slug>.mdx`.
- Navigation, titles, section icons, and page metadata are configured in `src/content/docs/content.meta.ts`.
- MDX modules resolve through `@ecopages/content-processor` (`ecopages:content/docs`) via `attachDocsContentModules()`.
- Do not add per-page `export const config` in MDX files; routing and layout live in the catch-all page.
- Shared JSX (`Banner`, `CodeTabs`, etc.) is injected via `getDocsMdxComponents()` at render time.
- Add explicit imports only when content needs module bindings (for example `ecopages:images` spreads).

## Configuration

- App-specific docs-kit wiring lives in `src/docs-kit.instance.ts` (`defineDocsKit()`).
- Pass `content: docsSiteContent` from `@/content/docs/content`.
- Register `contentProcessorPlugin()` in `eco.config.ts` for the docs MDX collection.
- Inject shell layout, MDX components, and burger events there — not inside `src/lib/docs-kit/`.
- Every MDX file must appear in `content.meta.ts`; orphan files fail `buildDocsManifest()`.

## Navigation

- Edit `src/content/docs/content.meta.ts` to add, remove, or reorder sections and pages.
- Add a matching `<section>/<slug>.mdx` file under `src/content/docs/`.
- Every page entry requires a `description` for SEO metadata; set `llms: false` to exclude from LLM exports.
- Section icon SVGs live in `src/content/docs/section-icons.tsx`.
- `getDocsManifest()` validates entries and caches the built manifest for client scripts.

## Routing

- All docs URLs are served by `src/pages/docs/[...slug]/index.tsx`.
- URL shape: `/docs/<section>/<slug>`.

## MDX

- The catch-all page resolves `section`/`slug` via `resolveDocsPage()` and renders `<Content components={getDocsMdxComponents()} />`.
- MDX loader options: `src/lib/docs-kit/mdx/mdx-plugin-options.ts` (wired into `eco.config.ts` via `ecopagesJsxPlugin`).

## Layout

- Docs chrome: `src/lib/docs-kit/layout/docs-layout/`.
- Docs bar: `src/lib/docs-kit/components/docs-bar/` composes app `Breadcrumb` + `CopyForLlm` from `@/components/`.
- Copy-for-LLM browser tests: `src/components/copy-for-llm/copy-for-llm.test.browser.ts`.
- Breadcrumb items are resolved server-side via `resolveDocsBreadcrumb()` — not in client scripts.
- Manifest JSON for client scripts: `<script type="application/json" id="docs-manifest-data">`.
