# Server and API Handlers

## Contents

- defineApiHandler / defineGet…defineQuery
- defineGroupHandler
- json / html / redirect
- Registering handlers
- Endpoint files
- Pages vs views
- Client-side routing (React)
- Agent tools (WebMCP and MCP)

## defineApiHandler

```typescript
import { defineApiHandler, definePost } from '@ecopages/core';
import { z } from 'zod';

export const createPost = definePost({
	path: '/api/posts',
	schema: {
		body: z.object({
			title: z.string().min(1),
			content: z.string(),
		}),
	},
	handler: async ({ body, response }) => {
		const post = await createPostInDB(body);
		return response.status(201).json(post);
	},
});

export const createPostAlt = defineApiHandler({
	path: '/api/posts',
	method: 'POST',
	schema: {
		body: z.object({
			title: z.string().min(1),
			content: z.string(),
		}),
	},
	handler: async ({ body, response }) => {
		const post = await createPostInDB(body);
		return response.status(201).json(post);
	},
});
```

`definePost` above is equivalent to `defineApiHandler` with `method: 'POST'`.

A handler written before a middleware list that holds an unannotated inline function sees none of the list's contexts. In define calls, put `middleware` before `handler`. In `app.get/post/…/group`, where options always come last, declare each middleware as a `Middleware` or `EcoMiddleware` constant.

When a route declares `schema.body`, core parses `application/json`, `text/plain`, `application/x-www-form-urlencoded` and `multipart/form-data` bodies before validation. A form post (`<form method="post">`) reaches the schema as a plain object: a repeated key becomes an array, a multipart file stays a `File`, and a form with no fields is `{}`. Form values are strings, so use `z.coerce.number()` or similar for numbers, and accept a single value as well as an array where a field may be posted once. Malformed JSON or a malformed multipart body returns HTTP 400. A request with no body and no `Content-Type`, or an empty body with a JSON or text type, is validated as `undefined`: required schemas return HTTP 400, and optional schemas can accept it. Other content types and nonempty bodies without a `Content-Type` return HTTP 415. The handler can still read `request`. A body over `maxRequestBodySize` (10 MiB by default, in `defineConfig`; `Infinity` for none) answers HTTP 413 without buffering more than the limit, and the body is read after the route's middleware, so a middleware can refuse first and sees `body` unset. A middleware that needs the raw body reads `request.clone()`; one that reads `request` itself makes the request fail with HTTP 500.

On the Ecopages server (Node or Bun), `new URL(request.url).origin` is the `Host` the visitor sent, so a handler can build absolute links and compare `Origin` with it. A request whose host is not allowed never reaches a handler: it gets HTTP 400, and so does a WebSocket upgrade. `allowedHosts` in `defineConfig` lists the allowed hostnames and `*.example.com` wildcards. The allowed hosts are the `baseUrl` host plus `allowedHosts`, which adds to it and never replaces it. `ecopages dev` and `ecopages preview` also allow `localhost`, its subdomains and IP addresses, and `ecopages start` allows only the list (set `ECOPAGES_BASE_URL` on the running server, and add `localhost` for a health check). `allowedHosts: true` turns the host check off and is unsafe; a request with no usable `Host` is refused either way. A WebSocket upgrade whose `Origin` is not the request origin (a page of another site) is refused with HTTP 403; one without `Origin` passes. `X-Forwarded-Host` and `X-Forwarded-Proto` count only with `trustProxy` in `defineConfig`: `true` for both, or `{ host: true }` / `{ proto: true }` for one, each safe only behind a proxy you control that overwrites that header. `app.fetch()` keeps the URL it is given.

A route that changes state for a browser lists `sameOrigin()` (from `@ecopages/core`) in `middleware`. For a method other than `GET`, `HEAD`, `OPTIONS` or `QUERY` it answers HTTP 403 before the body is read, unless: `Sec-Fetch-Site` is `same-origin` or `none` (no site started the request); or, without that header, `Origin` equals the origin of `request.url`. `same-site`, `cross-site` and `Origin: null` are refused, and so is a request with neither header, since a browser that strips both would be an open door. A route that serves clients that are not browsers (an MCP client, a webhook sender) and authenticates them itself passes `sameOrigin({ allowNonBrowser: true })`; `onReject(request)` builds a custom 403. The `Origin` comparison relies on the allowed-host check above, and behind a TLS proxy needs `trustProxy: { proto: true }`.

A request that fails `schema` answers HTTP 400 with `{ error: 'Validation failed', issues }`. Give the route `onInvalid(issues, ctx)` (in a define helper, an endpoint file export or the `app.get()` options) to answer it yourself, for example `response.redirect('/cart?notice=invalid', 303)` for an HTML form. `params`, `query` and `headers` are checked before middleware and the body after it, so for a body failure `onInvalid` sees the middleware locals and an unset `body`.

Method helpers: `defineGet`, `definePost`, `definePut`, `defineDelete`, `definePatch`, `defineOptions`, `defineHead`, `defineQuery`. `defineQuery`, `app.query()` and `api.query` handle the HTTP QUERY method, whose request body carries the query; it is not the context's `query` field (the URL's search parameters). Handlers may set `Accept-Query` themselves.

## defineGroupHandler

```typescript
import { defineGroupHandler } from '@ecopages/core';
import { authMiddleware } from './auth';
import AdminView from '../views/admin.tsx';

export const adminGroup = defineGroupHandler({
	prefix: '/admin',
	middleware: [authMiddleware],
	routes: (api) => [
		api.get({
			path: '/',
			handler: async (ctx) => ctx.render(AdminView, { user: ctx.session.user }),
		}),
		api.post({
			path: '/items',
			handler: async (ctx) => ctx.response.status(201).json({ created: true }),
		}),
	],
});
```

The `routes` callback also accepts the callable form `api({ path, method, handler })` when you need an uncommon method shape. Prefer `api.get` / `api.post` for standard verbs.

## json / html / redirect

Standalone helpers from `@ecopages/core` for handlers that return a body without using `context.response`:

```typescript
import { defineGet, json, html, redirect } from '@ecopages/core';

export const health = defineGet({
	path: '/api/health',
	handler: async () => json({ ok: true }),
});

export const landing = defineGet({
	path: '/landing',
	handler: async () => html('<p>hi</p>'),
});

export const loginRedirect = defineGet({
	path: '/login',
	handler: async () => redirect('/sign-in', 303),
});
```

`json` and `html` behave like `ctx.response.json()` / `ctx.response.html()` and take `{ status, headers }`.

## Registering handlers

Register prebuilt `defineApiHandler` / `defineGet` declarations with `app.add()` and groups with `app.group()`. Use `app.get(path, handler)` for an Explicit Route defined inline in `app.ts`. For `app.onError`, `HttpError` (`@ecopages/core/errors`), `app.static`, `app.notFound` and `app.serverError`, see [/docs-llm/server/explicit-routing.md](/docs-llm/server/explicit-routing.md).

```typescript
import { createApp } from '@ecopages/core/create-app';
import * as posts from './src/handlers/posts';
import { adminGroup } from './src/handlers/admin';

const app = await createApp();

app.add(posts.createPost);
app.group(adminGroup);

await app.start();
```

A route param can carry a literal suffix that starts with a dot, `app.get('/products/:handle.md', handler)` (or `[handle].md`): it matches only segments that end with the suffix, captures the part before it, and ranks before a bare `:handle` route, so it can sit beside the Page `/products/[handle]`. In the colon spelling a dot always starts the suffix (`:file.json` is the param `file` plus `.json`), and a suffix cannot hold `:`, `[` or `]`.

## Endpoint files

A file under `src/pages` ending in `.api.ts`, `.api.tsx`, `.api.js` or `.api.jsx` is an endpoint file: its path gives the URL (`src/pages/api/users/[id].api.ts` answers `/api/users/42` with `params.id === '42'`; declare `schema.params` to type it), and it needs no `app.add()`. Those endings are reserved; no Integration can register them. Export one handler per method, named exactly `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `OPTIONS`, `HEAD` or `QUERY`, built with the matching method helper and no `path`. Other exports are ignored.

```typescript
import { defineGet } from '@ecopages/core';

export const GET = defineGet({
	handler: async ({ params, response }) => response.json({ id: params.id }),
});
```

- A method the file does not export answers `405` with an `Allow` header. `HEAD` is not answered from `GET`, and `OPTIONS` is not added; export `OPTIONS` for a CORS preflight.
- A missing method export, a non-handler export, a handler built for another method, or a set `path` fails `ecopages build`; in dev, the file's first request answers `500`. The build imports each file, so its top-level code runs at build time.
- Two files on the same route fail at startup, whatever the parameter names.
- A URL that ends in a static file extension (`feed.xml`, `report.json`) cannot be an endpoint file; register it as an Explicit Route in `app.ts`.
- An Explicit Route on the same URL answers its methods first, and startup warns.
- Dev reloads the file on save. The build emits the server bundle (`dist/server/`) for `ecopages start`; `ecopages preview` does not serve endpoints.

Full rules: [/docs-llm/server/endpoint-files.md](/docs-llm/server/endpoint-files.md).

## Pages vs views

When rendering from handlers with `ctx.render()`:

- Component must be the default export, built with `eco.page()` (not a plain framework component)
- File lives outside `src/pages/`; `src/views/` is only a convention, and any folder works
- Import it and pass it to `ctx.render(Dashboard, props)`. The default export of an Integration-owned file becomes a view reference: development reloads on save, production reads the built module. A file without a default export, such as a file of named plain components, imports as itself
- Handler renders pass the request's Locals, Params and Query to the view as props. Call `ctx.render(...)` on the context; destructuring `render` loses Locals
- A full render uses the same route pipeline as a filesystem Page: every layout, default metadata, robots meta, and that view's page client plan. Props passed to the render are available to the view's `metadata`
- `ctx.renderPartial()` stays a component fragment
- The Html shell is not an island, even when its Integration differs from the page owner

## Client-side routing (React)

With `@ecopages/react-router`, anchor tags use SPA navigation by default. Use `data-eco-reload` for full page reloads.

## Client-side routing (browser-router)

With `@ecopages/browser-router`, the body of the next page is morphed into the current one. A custom element that exists on both pages is replaced by the incoming element, which upgrades from its own server markup, so it does not keep the live element's state. Add `data-eco-persist="<id>"` to keep an element and its state. To hand a live object to a custom element on navigation, set a property on it in an `eco:before-swap` listener: `event.detail.newDocument.querySelector('my-host').engine = engine`.

## Agent tools (WebMCP and MCP)

To offer the same tool to an agent in the visitor's browser (WebMCP) and to MCP clients at `/mcp`, define it once and follow the [ecoshop template](https://github.com/ecopages/ecopages/tree/main/templates/ecoshop) (`src/lib/agents`); the [Agent tools recipe](https://ecopages.app/docs/recipes/agent-tools) walks through it. There is no framework helper: what the surfaces share is the app's own.

- Keep a tool's data (name, title, description, annotations) in a module with no imports, and its Zod input schema in another that only the server imports. A `.server` module runs the tool.
- A Radiant host decorates the method that does the work with `@agentTool`, which reads plain values (Radiant 0.14): `inputSchema` is a static object, not a function or a promise, and no field is a getter; `getEnabled` stays a function. Leave out `parse`, since a Zod `parse` would ship Zod. Write the JSON Schema from the Zod schema with `z.toJSONSchema`, commit it, and add a test that fails when it differs from the definitions, so the schema library never ships to a page.
- Validate on the server: the Endpoint the method calls and the MCP server parse the input with Zod, and answer input they refuse with a tool error naming the first invalid fields.
