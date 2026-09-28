# React Better Auth template

An Ecopages React app with Better Auth and Drizzle ORM. Pages are static-first; handlers and protected routes use request-time rendering where auth requires it.

## Agent skills

[AGENTS.md](./AGENTS.md). Pack in this template: [Building with Ecopages](.agents/skills/ecopages/SKILL.md) ([hosted](https://ecopages.app/skill/SKILL.md)). Handlers, auth, and the database: `.agents/skills/ecopages/reference/full-stack.md` and `.agents/skills/ecopages/reference/server.md`.

Index: [`.agents/README.md`](.agents/README.md). Docs index: [ecopages.app/llms.txt](https://ecopages.app/llms.txt).

## Features

- **Ecopages** - Static-first framework with React support
- **Better Auth** - Email/password and GitHub authentication
- **Drizzle ORM** - Type-safe database queries
- **React Router** - SPA navigation with view transitions
- **Tailwind CSS v4** - Modern styling with editorial design system
- **SQLite** - Local database via libSQL (Node and Bun)

## Design

This app features an **editorial/magazine aesthetic** with:

- Warm paper tones and deep charcoal text
- Terracotta accent colors
- Fraunces display font and Source Sans 3 body font
- Generous whitespace and clear typographic hierarchy

## Getting Started

### Prerequisites

- Node.js 24 or later (Bun is optional)

### Installation

1. Install dependencies:

```bash
pnpm install
# or npm install / bun install
```

2. Set up environment variables:

```bash
cp .env.example .env
```

Edit `.env` and set:

- `BETTER_AUTH_SECRET` - A secret string at least 32 characters long
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` - GitHub OAuth app credentials (optional until you enable GitHub sign-in)

3. Initialize the database:

```bash
pnpm db:push
```

Or generate migrations:

```bash
pnpm db:generate
pnpm db:migrate
```

### Development

Start the development server:

```bash
pnpm dev
```

The app will be available at `http://localhost:3000`.

### Build

Build for production:

```bash
pnpm build
```

Preview the production build:

```bash
pnpm preview
```

Start the production server:

```bash
pnpm start
```

## Project Structure

```
src/
├── components/     # React components
├── handlers/       # API handlers (defineApiHandler, defineGroupHandler)
├── includes/        # HTML templates (head, html, seo)
├── layouts/         # Layouts
├── lib/            # Utilities (auth, db, schema)
├── pages/           # Pages (eco.page)
└── styles/          # CSS files (Tailwind v4)
.agents/skills/      # Ecopages agent skill pack
```

## Authentication

The app uses Better Auth with email/password and GitHub authentication:

- **Sign up**: `/signup` - Create a new account
- **Sign in**: `/login` - Sign in to your account
- **Dashboard**: `/dashboard` - Protected route (requires authentication)

### GitHub OAuth

Create an OAuth App in the [GitHub Developer settings](https://github.com/settings/developers). Set the callback URL to:

```text
http://localhost:3000/api/auth/callback/github
```

Then put the client ID and secret in `.env` as `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`. The GitHub app must include the `user:email` scope.

The Continue with GitHub button is shown only when both values are set. Otherwise login and signup show a dismissible warning. If you only want password login, remove that warning from `src/components/social-sign-in.tsx`.

### Layout Strategy

All pages share a single `BaseLayout` that uses `AuthNav` — a client-side session-aware navigation component.

- Pages with auth middleware (e.g. `/dashboard`) pass `locals.session` for instant SSR rendering.
- Pages without middleware (e.g. `/skills`) let `AuthNav` resolve the session client-side on hydration via `authClient.useSession()`.

This ensures the nav always reflects the actual auth state, regardless of the page type.

## Database

The app uses SQLite through [Drizzle's libSQL driver](https://orm.drizzle.team/docs/sqlite/get-started-sqlite). The database file (`sqlite.db`) is created automatically on first run.

### Schema

The database includes tables for:

- `user` - User accounts
- `session` - Active sessions
- `account` - Authentication accounts
- `verification` - Email verification tokens

## Tech Stack

- **Runtime**: Node.js (Bun optional)
- **Framework**: Ecopages
- **UI**: React 19
- **Routing**: @ecopages/react-router
- **Auth**: Better Auth
- **Database**: SQLite + Drizzle ORM + libSQL
- **Styling**: Tailwind CSS v4
- **TypeScript**: Full type safety

## License

MIT
