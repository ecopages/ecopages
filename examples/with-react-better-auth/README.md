# LLMS App

A modern web application built with Ecopages, Better Auth, and Drizzle ORM, running on Bun.

## Features

- **Ecopages** - Static site generator with React support
- **Better Auth** - Email/password authentication
- **Drizzle ORM** - Type-safe database queries
- **React Router** - SPA navigation with view transitions
- **Tailwind CSS v4** - Modern styling with editorial design system
- **Bun** - Fast JavaScript runtime

## Design

This app features an **editorial/magazine aesthetic** with:

- Warm paper tones and deep charcoal text
- Terracotta accent colors
- Fraunces display font and Source Sans 3 body font
- Generous whitespace and clear typographic hierarchy

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) installed

### Installation

1. Install dependencies:

```bash
bun install
```

2. Set up environment variables:

```bash
cp .env.example .env
```

Edit `.env` and set:

- `BETTER_AUTH_SECRET` - A secret string at least 32 characters long

3. Initialize the database:

```bash
bun run db:push
```

Or generate migrations:

```bash
bun run db:generate
bun run db:migrate
```

### Development

Start the development server:

```bash
bun run dev
```

The app will be available at `http://localhost:3000`.

### Build

Build for production:

```bash
bun run build
```

Preview the production build:

```bash
bun run preview
```

Start the production server:

```bash
bun run start
```

## Project Structure

```
src/
├── components/     # React components
├── handlers/       # API handlers (defineApiHandler, defineGroupHandler)
├── includes/        # HTML templates (head, html, seo)
├── layouts/         # Page layouts
├── lib/            # Utilities (auth, db, schema)
├── pages/           # Page components (eco.page)
└── styles/          # CSS files (Tailwind v4)
```

## Authentication

The app uses Better Auth with email/password authentication:

- **Sign up**: `/signup` - Create a new account
- **Sign in**: `/login` - Sign in to your account
- **Dashboard**: `/dashboard` - Protected route (requires authentication)

## Database

The app uses SQLite with Drizzle ORM. The database file (`sqlite.db`) is created automatically on first run.

### Schema

The database includes tables for:

- `user` - User accounts
- `session` - Active sessions
- `account` - Authentication accounts
- `verification` - Email verification tokens

## Tech Stack

- **Runtime**: Bun
- **Framework**: Ecopages
- **UI**: React 19
- **Routing**: @ecopages/react-router
- **Auth**: Better Auth
- **Database**: SQLite + Drizzle ORM
- **Styling**: Tailwind CSS v4
- **TypeScript**: Full type safety

## License

MIT
