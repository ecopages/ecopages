# Eco Blog

A blog with an author area, built with Ecopages JSX, Radiant UI, Drizzle ORM on SQLite (libSQL) and Better Auth.

## Quick start

```bash
pnpm install
pnpm db:setup   # create the tables and seed 10 posts
pnpm dev
```

Open http://localhost:3000 and sign in at `/login` as `admin@test.com` / `password`.

`pnpm db:reset` deletes the database, `dist/` and uploaded images, then migrates and seeds again.

## How it is built

| URL                                                            | File                                          | Rendering                               |
| -------------------------------------------------------------- | --------------------------------------------- | --------------------------------------- |
| `/`                                                            | `src/pages/index.tsx`                    | ISR (`revalidate: 60`, tag `posts`)     |
| `/posts/[slug]`                                                | `src/pages/posts/[slug].tsx`             | Dynamic Page, `404` for an unknown slug |
| `/login`, `/signup`                                            | `src/pages/login.tsx`, `signup.tsx` | Static Pages                            |
| `/admin`, `/admin/new`, `/admin/posts/[id]`                    | `src/pages/admin/**`                          | Dynamic Pages behind `requireSession`   |
| `/api/auth/*`                                                  | `src/pages/api/auth/[...all].api.ts`          | Endpoint: Better Auth                   |
| `POST /api/posts`, `/api/posts/[id]`, `/api/posts/[id]/delete` | `src/pages/api/posts/**`                      | Endpoints: create, update, delete       |
| `POST /api/upload`                                             | `src/pages/api/upload.api.ts`                 | Endpoint: editor image upload           |

- `requireSession` (`src/lib/require-session.server.ts`) puts the session on `locals.session` or redirects to `/login`. Admin Pages declare `requires: ['session']`; the endpoints use the same middleware.
- Every write invalidates the `posts` cache tag, so the home page shows the change on the next request in production.
- Modules that hold secrets or the database end in `.server.ts`, which keeps them out of browser bundles.
- `app.ts` registers no routes: every URL comes from `src/pages`.
- Post bodies are Markdown. `src/components/markdown.tsx` parses them with `mdast-util-from-markdown` (GFM on) and renders each node as an element, so a post never reaches the page as an HTML string: HTML written in a post shows as text, and links and images keep only `http(s)`, `mailto` and relative URLs.

## Styling

Components come from `@ecopages/radiant-ui` (buttons, inputs, textareas) and take their colours from its semantic tokens, so light and dark mode follow the system. Radiant UI's token packs are Tailwind v4 sources, which is why `src/styles/app.css` imports `tailwindcss` first; the app itself uses no Tailwind utility classes.

The rest follows [good-css](https://good-css.com/):

- one fluid `pow()` scale for type and space, in `src/styles/app.css`;
- a content grid with breakouts on every page, intrinsic card grids with subgrid rows, and a sidebar that wraps in the author area;
- logical properties, `:focus-visible` rings, hover styles only for fine pointers, motion only under `prefers-reduced-motion: no-preference`;
- cross-document view transitions;
- one stylesheet per component, loaded by importing it from the component.

The reset and base element rules sit in `@layer base`, so Radiant UI's component layer wins over them.

## Database

The schema is `src/lib/schema.ts`. `DATABASE_URL` selects the database (default `file:sqlite.db`).

```bash
pnpm db:generate   # write a migration after changing the schema
pnpm db:migrate    # apply pending migrations
pnpm db:seed       # add the admin user and 10 posts
```

## Environment

Copy `.env.example` to `.env`. Set `BETTER_AUTH_SECRET` (at least 32 characters) outside development, and `ECOPAGES_BASE_URL` to the public URL.

## Tests

```bash
pnpm exec playwright test --project=eco-blog-e2e   # from the repository root
```

The suite builds the app against its own `e2e.db`, starts it on port 4622, and covers the public pages, the redirect to `/login`, and creating, editing and deleting a post in the author area.
