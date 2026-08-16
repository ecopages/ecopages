# React Better Auth playground

A modern web application built with Ecopages, Better Auth, and Drizzle ORM.

## Features

- **Ecopages** - Static-first framework with React support
- **Better Auth** - Email/password and GitHub authentication
- **Drizzle ORM** - Type-safe database queries
- **React Router** - SPA navigation with view transitions
- **Tailwind CSS v4** - Modern styling with editorial design system
- **SQLite** - Local database via libSQL (Node and Bun)

## Getting Started

### Prerequisites

- Node.js 24 or later (Bun is optional)

### Installation

1. Install dependencies:

```bash
pnpm install
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

```bash
pnpm dev
```

The app will be available at `http://localhost:3000`.

## Authentication

- **Sign up**: `/signup`
- **Sign in**: `/login`
- **Dashboard**: `/dashboard` (requires authentication)

Create a GitHub OAuth App with callback URL `http://localhost:3000/api/auth/callback/github`, then set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`. The GitHub button appears only when both are set. Otherwise login shows a dismissible warning; remove it from `social-sign-in.tsx` if you only want password login.

## Database

SQLite through [Drizzle's libSQL driver](https://orm.drizzle.team/docs/sqlite/get-started-sqlite). The database file (`sqlite.db`) is created on first run.

## License

MIT
