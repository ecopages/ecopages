---
'@ecopages/core': minor
---

Serve API routes from files: a `*.api.ts` file under the pages directory is an endpoint whose URL is its path. `src/pages/api/users/[id].api.ts` answers `/api/users/[id]`, with `index.api.ts` and `[...slug].api.ts` following the Page naming rules. The file exports one handler per method, built with the method helpers without `path` (`export const GET = defineGet({ handler })`), and answers through the same pipeline as `app.add()` routes: params (a catch-all as an array), schema validation, middleware and `app.onError`. A method the file does not export answers `405` with an `Allow` header. In `ecopages dev`, saving the file serves its new handlers without a restart.

Rules: two files on the same route, whatever the parameter names, fail discovery with the duplicate-route error, which now also catches two Pages such as `[slug].tsx` beside `[id].tsx`. An `app.ts` route on an endpoint's route keeps the methods it registers, and startup logs a warning naming both. An endpoint file whose URL ends in a known static file extension, such as `feed.xml.api.ts`, fails discovery; register that URL in `app.ts`. Endpoint files are never statically generated, listed in the sitemap or prebuilt as Pages, even when `.ts` is a registered Page extension.

Build and production: `ecopages build` imports every endpoint file and checks its exports before bundling, so a file with no method export, a method export built for another method, or one that sets `path` fails the build with an error naming the file and its URL. `--keep-going` does not skip this check. A build whose only handlers are endpoint files now writes `dist/.server/`, so `ecopages start` runs it.

Helpers: `defineGet`, `definePost` and the other method helpers accept a handler without `path`; with `path` they behave and infer as before. The `api.get` / `api.post` helpers inside `defineGroupHandler` still require `path`, and `app.add()` and `app.group()` throw for a handler without one.
