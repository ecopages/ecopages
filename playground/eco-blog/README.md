# Eco Blog

A blog with an author area, built with Ecopages, KitaJS, Drizzle ORM on SQLite (libSQL) and Better Auth.

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
| `/`                                                            | `src/pages/index.kita.tsx`                    | ISR (`revalidate: 60`, tag `posts`)     |
| `/posts/[slug]`                                                | `src/pages/posts/[slug].kita.tsx`             | Dynamic Page, `404` for an unknown slug |
| `/login`, `/signup`                                            | `src/pages/login.kita.tsx`, `signup.kita.tsx` | Static Pages                            |
| `/admin`, `/admin/new`, `/admin/posts/[id]`                    | `src/pages/admin/**`                          | Dynamic Pages behind `requireSession`   |
| `/api/auth/*`                                                  | `src/pages/api/auth/[...all].api.ts`          | Endpoint: Better Auth                   |
| `POST /api/posts`, `/api/posts/[id]`, `/api/posts/[id]/delete` | `src/pages/api/posts/**`                      | Endpoints: create, update, delete       |
| `POST /api/upload`                                             | `src/pages/api/upload.api.ts`                 | Endpoint: editor image upload           |

- `requireSession` (`src/lib/require-session.server.ts`) puts the session on `locals.session` or redirects to `/login`. Admin Pages declare `requires: ['session']`; the endpoints use the same middleware.
- Every write invalidates the `posts` cache tag, so the home page shows the change on the next request in production.
- Modules that hold secrets or the database end in `.server.ts`, which keeps them out of browser bundles.
- `app.ts` registers no routes: every URL comes from `src/pages`.

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
