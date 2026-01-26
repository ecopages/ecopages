# Eco Blog

A modern, high-performance blog application built with **Ecopages**, **Bun**, and **Drizzle ORM**.

## Tech Stack

- **Runtime:** [Bun](https://bun.sh) - Fast JavaScript runtime & package manager.
- **Framework:** [Ecopages](https://ecopages.app) - Lit + JSX (KitaJS) for optimal performance.
- **Database:** SQLite - Simple, file-based database.
- **ORM:** [Drizzle ORM](https://orm.drizzle.team) - Type-safe database access and migration management.
- **Auth:** [Better Auth](https://www.better-auth.com) - Secure authentication.
- **Styling:** Tailwind CSS - Utility-first CSS framework.

## Quick Start

1.  **Setup Project**
    Run the setup command to install dependencies and initialize the database.

    ```bash
    bun setup
    ```

2.  **Start Development Server**
    ```bash
    bun dev
    ```

## Reset the Project [Fresh Start]

If you want to completely reset your environment (clear database, remove dependencies, and reinstall):

```bash
bun reset
```

**Warning:** This will delete your local `sqlite.db` and all data in it!

## Database & Migrations

We use **Drizzle Kit** to manage schema changes.

- **Schema Definition:** `src/lib/schema.ts`
- **Generate Migration:** Run this after modifying the schema:
    ```bash
    bun db:generate
    ```
- **Apply Migration:** Apply pending migrations to local DB:
    ```bash
    bun db:migrate
    ```
- **Seed Database:** Populate the database with dummy data (development only):
    ```bash
    bun db:seed
    ```
- **Studio:** View your database content in a GUI:
    ```bash
    bun db:studio
    ```

## Project Structure

```
├── src/
│   ├── components/     # Lit Web Components & UI
│   ├── handlers/       # API Route Handlers
│   ├── lib/
│   │   ├── db.ts       # Database access layer
│   │   ├── schema.ts   # Drizzle Schema definitions
│   │   └── auth.ts     # Auth configuration
│   ├── pages/          # Ecopages Route Components
│   └── views/          # Server-side Templates (KitaJS)
├── drizzle/            # SQL Migration files
├── scripts/            # Utility scripts (reset.ts)
├── ecopages.config.ts  # Ecopages configuration
└── app.ts              # App entry point
```
