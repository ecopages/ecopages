# Ecopages + Electrobun

A starter for desktop apps with Ecopages Pages, the Radiant UI Zed Compact theme, and Better Auth. The app opens to sign-in, then an empty Dashboard. The Account Page shows the signed-in user's name and email and lets them sign out.

The theme follows the system's light or dark appearance and updates while the app is open.

Develop the same app in a browser or an Electrobun window. Browser mode sends no content policy, draws no window buttons, and opens GitHub sign-in in a second tab. Ecopages handles routing, rendering, and HTTP responses. Effect runs authentication workflows, and Drizzle queries app-owned data in SQLite. Better Auth manages its own tables in the same database.

## Get started

Install Node.js 24.22+ on the 24.x line or Node.js 26+, plus Bun and pnpm.

While the template is in development, run it from the Ecopages checkout that contains it:

```sh
pnpm install
pnpm --filter @ecopages/template-electrobun dev
```

Once an Ecopages CLI release includes `electrobun`, generate a standalone project:

```sh
npx ecopages init my-workspace --template electrobun
cd my-workspace
pnpm install
pnpm dev
```

Open [127.0.0.1:3210](http://127.0.0.1:3210), choose **Create an account**, and sign up with an email and password. The account belongs to this local database. The starter sends no email, so there is no verification or password reset.

## Develop in a desktop window

Stop the browser development server before switching to the desktop so the port is free. Run this from the project directory. From the monorepo root, use `pnpm --filter @ecopages/template-electrobun desktop:dev`.

```sh
pnpm desktop:dev
```

The first run prepares the Electrobun SDK for your machine. Leave the window open while you edit Pages, Components, or styles in `src/`. Ecopages hot reload updates the webview. Restart the command after changing `desktop/`, `electrobun.config.ts`, or environment variables.

Both modes use `127.0.0.1:3210` by default. If the port is already in use, stop the other app or set `ECOPAGES_PORT` in `.env`. Use the exact `127.0.0.1` address for browser development because auth checks the request origin. Browser development stores `auth.sqlite` in `.data/`. Desktop development and packaged builds use separate directories under Electrobun's user-data directory, so accounts created in one mode won't appear in another.

## Enable GitHub sign-in

GitHub sign-in is optional. The **Continue with GitHub** button appears only when both `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are set.

1. Create a [GitHub OAuth App](https://github.com/settings/developers). Set its authorization callback URL to `http://127.0.0.1:3210/api/auth/callback/github`. If you changed `ECOPAGES_PORT`, use the same port in the callback URL.
2. Copy the sample environment file and set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in `.env`.

    ```sh
    cp .env.example .env
    ```

3. Restart the app and click **Continue with GitHub**. Finish authorization in the browser that opens, then return to the app.

Keep `.env` local. Accounts are not linked: GitHub sign-in for an email that already has a password account ends with "GitHub sign-in did not finish". A production GitHub sign-in flow for a distributed app should keep the shared OAuth secret on a hosted service and hand the session back to the desktop app.

## Extend the app

| Where                                                    | What to change                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [`src/pages/`](src/pages/)                               | Add Pages as Filesystem Routes. Use normal links and forms to navigate between them. |
| [`src/layouts/shell-layout/`](src/layouts/shell-layout/) | Change the shared header, collapsible sidebar, panel, or styles.                     |
| [`src/lib/`](src/lib/)                                   | Add Effect workflows and Drizzle queries for app data.                               |
| [`app.ts`](app.ts)                                       | Register Explicit Routes for HTTP handlers that sit outside the Pages directory.     |
| [`electrobun.config.ts`](electrobun.config.ts)           | Set the desktop app name, identifier, version, and icons.                            |

Use `ShellLayout` for the shared header. For an authenticated workspace Page, follow [`src/pages/dashboard.tsx`](src/pages/dashboard.tsx) for the session middleware, request-time rendering, and sidebar and panel setup.

## Run checks

```sh
pnpm typecheck
pnpm desktop:typecheck
pnpm test
pnpm exec playwright install chromium
pnpm test:browser
```

`pnpm test` runs the server suite with `@effect/vitest` and a temporary SQLite database. Run the Chromium install once before running the UI suite in Vitest Browser Mode.

## Build a desktop app

Run this from a generated project or another standalone copy with its own `pnpm-lock.yaml`. From the Ecopages monorepo, use `pnpm desktop:dev` to run the starter.

1. Set `app.name`, `app.identifier`, and `app.version` in [`electrobun.config.ts`](electrobun.config.ts). To rebrand the app, replace the images in [`desktop/ecopages.iconset/`](desktop/ecopages.iconset/). macOS uses the iconset, and Windows and Linux use its 512 px PNG.
2. Stop any development server using the same port, then build the desktop app.

    ```sh
    pnpm desktop:build
    ```

Open the development bundle under `build/` for your host platform. It includes the built Ecopages app and its production dependencies. Local account data stays in the system user-data directory. For local GitHub testing, pass credentials through the launch environment because the bundle doesn't include `.env`.

For signing and release packaging, see the [Electrobun distribution guide](https://docs.electrobun.dev/electrobun/guides/bundling-and-distribution/).
